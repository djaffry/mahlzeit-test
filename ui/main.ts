/* ── Forkcast — app entry point ────────────────────────── */

// CSS (bundled by Vite)
import "./styles/style.css"
import "./styles/carousel.css"
import "./styles/dice.css"
import "./styles/share.css"

// Config & constants
import { config } from "./config"
import { DAYS } from "./constants"
import type { Restaurant } from "./types"

// Data layer
import { fetchMenuData, fetchLanguages } from "./data/fetcher"
import { initI18n, getCurrentLanguage, getSourceLanguage, t } from "./i18n/i18n"
import { initContentHash, startAutoRefresh, flushPendingRefresh } from "./data/auto-refresh"

// Utilities
import { loadTagsFromUrl, collectTags } from "./utils/tag-utils"
import {
  getTodayName,
  getWeekDates,
  getDataWeekDates,
  isDataFromCurrentWeek,
  getLatestFetchTime,
  formatShortDate,
  formatDateTime,
} from "./utils/date"
import { escapeHtml, smoothScrollTo, isOverlayOpen } from "./utils/dom"
import { haptic } from "./utils/haptic"

// Components
import { renderSkeleton } from "./components/skeleton"
import {
  setup as carouselSetup,
  attach as carouselAttach,
  switchTo as carouselSwitchTo,
  goTo as carouselGoTo,
  getActiveIndex as carouselGetActiveIndex,
  getActivePanel as carouselGetActivePanel,
  syncHeight as carouselSyncHeight,
  cancel as carouselCancel,
  restorePosition as carouselRestorePosition,
} from "./components/carousel"
import { renderDay, revealCards } from "./components/restaurant-card"
import {
  loadFilters,
  buildFilterButtons,
  applyFilters,
  setupFilterListeners,
  isFilterShowAll,
  itemMatchesFilters,
} from "./components/filter-bar"
import { setupSearchListeners } from "./components/search"
import { setupLanguageToggle } from "./components/language-toggle"
import { setupThemeToggle, setupPartyMode } from "./components/theme-toggle"
import { renderWeekendState, renderStaleDataState } from "./components/weekend-overlay"
import {
  moveInlineMap,
  initInlineMap,
  syncInlineMap,
  setupMapListeners,
  rebuildInlineMap,
  toggleMapCard,
  focusOnMap,
} from "./components/map"
import { setup as diceSetup } from "./components/dice"
import {
  setup as shareSetup,
  isActive as shareIsActive,
  clearSelection as shareClearSelection,
  getShareSelectionData,
} from "./components/share"

/* ── Module-level state ───────────────────────────────── */

let _restaurants: Restaurant[] = []
let _overlayDismissed = false

function getMenuRestaurants(): Restaurant[] {
  return _restaurants.filter((r) => r.type !== "link")
}

function getLinkRestaurants(): Restaurant[] {
  return _restaurants.filter((r) => r.type === "link")
}

function getAllRestaurants(): Restaurant[] {
  return _restaurants
}

/* ── Collapsed state persistence ──────────────────────── */

function loadCollapsed(): Set<string> {
  try {
    const stored = localStorage.getItem("collapsed-restaurants")
    if (stored) {
      const arr = JSON.parse(stored)
      if (Array.isArray(arr)) return new Set(arr)
    }
  } catch {
    /* ignore */
  }
  return new Set()
}

function saveCollapsed(): void {
  const panel = carouselGetActivePanel() ?? document.querySelector(".day-panel") ?? document
  const ids = [...panel.querySelectorAll(".restaurant-card.collapsed")]
    .map((el) => (el as HTMLElement).dataset.restaurant)
    .filter((id): id is string => id !== undefined)
  localStorage.setItem("collapsed-restaurants", JSON.stringify(ids))
}

/* ── Map collapsed preference ─────────────────────────── */

function getMapCollapsed(): boolean {
  const pref = localStorage.getItem("map-collapsed")
  return pref !== null ? pref === "true" : window.innerWidth <= 768
}

/* ── Day tabs rendering ───────────────────────────────── */

function renderDayTabs(
  tabsEl: HTMLElement,
  weekDates: Date[],
  today: string | null,
  activeDay: string
): void {
  tabsEl.innerHTML =
    DAYS.map((d, i) => {
      const cls = ["tab"]
      if (d === today) cls.push("today")
      if (d === activeDay) cls.push("active")
      const date = formatShortDate(weekDates[i])
      return `<button class="${cls.join(" ")}" data-day="${d}"><span class="tab-full">${t('day.' + d)} <span class="tab-date">${date}</span></span><span class="tab-short">${t('dayShort.' + d)} <span class="tab-date">${date}</span></span><kbd class="kbd">${i + 1}</kbd></button>`
    }).join("") + '<div class="tab-indicator" aria-hidden="true"></div>'
}

/* ── Day panels rendering ─────────────────────────────── */

function renderDayPanels(
  contentEl: HTMLElement,
  menuRestaurants: Restaurant[],
  linkRestaurants: Restaurant[],
  activeDay: string
): void {
  const collapsedSet = loadCollapsed()
  const mapCollapsed = getMapCollapsed()
  contentEl.innerHTML =
    '<div class="carousel" id="carousel"><div class="carousel-track">' +
    DAYS.map(
      (d) =>
        `<div class="day-panel" data-panel="${d}">${renderDay(menuRestaurants, linkRestaurants, d, collapsedSet, mapCollapsed)}</div>`
    ).join("") +
    '</div></div><span class="sr-only" id="day-announcer" aria-live="polite"></span>'

  // Make non-active panels' cards instantly visible (they're seen during swipe)
  contentEl
    .querySelectorAll(`.day-panel:not([data-panel="${activeDay}"]) .restaurant-card`)
    .forEach((c) => c.classList.add("visible", "settled"))
}

/* ── Panel refresh ────────────────────────────────────── */

function refreshPanel(instant = false): void {
  const panel = carouselGetActivePanel()
  applyFilters(panel)
  if (panel) revealCards(panel, instant)
  carouselSyncHeight()
}

/* ── Footer ───────────────────────────────────────────── */

function renderFooter(latest: string | null, footerEl: HTMLElement): void {
  const pageLoadTime = formatDateTime(new Date())
  const fetchTime = latest ? formatDateTime(new Date(latest)) : null
  footerEl.innerHTML = fetchTime
    ? `${escapeHtml(t('footer.loaded', { time: pageLoadTime }))}<br>${escapeHtml(t('footer.fetched', { time: fetchTime }))}`
    : escapeHtml(t('footer.loaded', { time: pageLoadTime }))
}

/* ── Show carousel for a specific day (browse button) ── */

function showCarouselForDay(day: string): void {
  _overlayDismissed = true
  carouselSwitchTo(day)
  carouselRestorePosition(DAYS.indexOf(day as (typeof DAYS)[number]))
  moveInlineMap(DAYS[carouselGetActiveIndex()], carouselGetActivePanel)
  refreshPanel()
  syncInlineMap()
}

/* ── Collapse / expand delegation ─────────────────────── */

function setupCollapseExpand(contentEl: HTMLElement): void {
  contentEl.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return
    if (!e.target.closest(".collapse-btn")) return
    const card = e.target.closest(".restaurant-card") as HTMLElement | null
    if (!card || card.classList.contains("map-card")) return
    const id = card.dataset.restaurant
    const shouldCollapse = !card.classList.contains("collapsed")
    contentEl
      .querySelectorAll<HTMLElement>(`.restaurant-card[data-restaurant="${id}"]`)
      .forEach((c) => c.classList.toggle("collapsed", shouldCollapse))
    saveCollapsed()
    carouselSyncHeight()
  })

  contentEl.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return
    const pinBtn = e.target.closest(".map-pin-link")
    if (pinBtn) {
      const card = pinBtn.closest(".restaurant-card") as HTMLElement | null
      if (card) {
        e.preventDefault()
        focusOnMap(card.dataset.restaurant ?? "", getAllRestaurants())
        return
      }
    }
  })
}

/* ── Tab switching ────────────────────────────────────── */

function setupTabSwitching(tabsEl: HTMLElement): void {
  tabsEl.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return
    const btn = e.target.closest(".tab") as HTMLElement | null
    if (!btn) return
    haptic()
    const day = btn.dataset.day ?? ""
    const idx = DAYS.indexOf(day as (typeof DAYS)[number])
    if (idx === -1) return

    carouselCancel()
    carouselSwitchTo(day)
    shareClearSelection()

    window.scrollTo({ top: 0, behavior: "smooth" })
    document.querySelectorAll(".dice-pick").forEach((el) => el.classList.remove("dice-pick"))

    moveInlineMap(day, carouselGetActivePanel)
    refreshPanel()
    carouselGoTo(idx)
    syncInlineMap()
  })
}

/* ── Apply refresh (auto-refresh callback) ────────────── */

function applyRefresh(newData: Restaurant[]): void {
  // 0. Cancel any in-progress snap animation
  carouselCancel()

  // 1. Snapshot
  const activeTab =
    (document.querySelector(".tab.active") as HTMLElement | null)?.dataset.day ?? DAYS[0]
  const scrollY = window.scrollY

  // 2. Clear transient state (share-bar lives outside #content, so clear it explicitly)
  document.querySelector(".share-bar")?.classList.remove("visible")

  // 3. Update data
  _restaurants = newData
  initContentHash(newData)
  const menuRestaurants = getMenuRestaurants()
  const linkRestaurants = getLinkRestaurants()

  // 4. Re-render tabs
  const tabsEl = document.getElementById("day-tabs")!
  const contentEl = document.getElementById("content")!
  const today = getTodayName()
  const dataWeekDates = getDataWeekDates(menuRestaurants)
  const isCurrentWeek = isDataFromCurrentWeek(menuRestaurants)
  renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, activeTab)

  // 5. Re-render panels
  renderDayPanels(contentEl, menuRestaurants, linkRestaurants, activeTab)

  // Restore carousel state — set scrollLeft synchronously before attach
  // so the tab indicator sees the correct position (no 1-frame flicker)
  carouselSwitchTo(activeTab)
  const carousel = document.getElementById("carousel")
  const activeIdx = DAYS.indexOf(activeTab as (typeof DAYS)[number])
  if (carousel && activeIdx > 0) carousel.scrollLeft = activeIdx * carousel.offsetWidth

  // Re-attach carousel listeners (DOM was rebuilt)
  carouselAttach()

  moveInlineMap(DAYS[carouselGetActiveIndex()], carouselGetActivePanel)

  // 6. Rebuild filters
  const allTags = collectTags(menuRestaurants)
  loadFilters(allTags)
  buildFilterButtons(allTags)

  // 7. Instant reveal
  refreshPanel(true)

  // 8. Restore scroll
  window.scrollTo(0, scrollY)

  // 9. Rebuild map if visible
  const mapCard = document.getElementById("map-card")
  if (mapCard && !mapCard.classList.contains("map-collapsed")) {
    rebuildInlineMap(getAllRestaurants())
  }

  // 10. Re-evaluate stale/weekend overlay (skip if user already dismissed it)
  if (!_overlayDismissed) {
    if (!today) {
      renderWeekendState(showCarouselForDay)
    } else if (!isCurrentWeek) {
      renderStaleDataState(activeTab, showCarouselForDay)
    }
  }
}

/* ── Dynamic aria-labels / placeholders ───────────────── */

function updateTranslatedUI(): void {
  // Title bar
  document.title = config.title + " - " + config.subtitle
  const toolbarTitle = document.querySelector(".toolbar-title")
  if (toolbarTitle) toolbarTitle.textContent = config.title
  const toolbarSubtitle = document.querySelector(".toolbar-subtitle")
  if (toolbarSubtitle) toolbarSubtitle.textContent = config.subtitle

  // Aria-labels and placeholders
  document.getElementById('search-trigger')?.setAttribute('aria-label', t('search.ariaLabel'))
  document.getElementById('feedback-link')?.setAttribute('aria-label', t('feedback.ariaLabel'))
  document.getElementById('dice-btn')?.setAttribute('aria-label', t('dice.ariaLabel'))
  document.getElementById('theme-toggle')?.setAttribute('aria-label', t('theme.ariaLabel'))
  document.getElementById('party-toggle')?.setAttribute('aria-label', t('party.ariaLabel'))
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null
  if (searchInput) searchInput.placeholder = t('search.placeholder')
  const mapTitle = document.querySelector('.map-title')
  if (mapTitle) mapTitle.textContent = t('map.title')
  const mapClose = document.getElementById('map-close')
  if (mapClose) mapClose.setAttribute('aria-label', t('map.close'))
}

/* ── Init ─────────────────────────────────────────────── */

async function init(): Promise<void> {
  // Initialize i18n first so all rendering uses translated strings
  const languages = await fetchLanguages()
  initI18n(languages)
  updateTranslatedUI()

  const tabsEl = document.getElementById("day-tabs")!
  const contentEl = document.getElementById("content")!
  const footerEl = document.getElementById("footer")!
  const filtersEl = document.getElementById("filters")!
  const today = getTodayName()
  const isWeekend = !today
  const activeDay = today || DAYS[0]
  const weekDates = getWeekDates()

  renderDayTabs(tabsEl, weekDates, today, activeDay)

  // Show skeleton while loading
  renderSkeleton(contentEl)

  try {
    const loadStart = Date.now()
    const [, allRestaurants] = await Promise.all([
      loadTagsFromUrl(`${config.dataPath}/tags.json`),
      fetchMenuData(getCurrentLanguage(), getSourceLanguage()),
    ])

    _restaurants = allRestaurants
    initContentHash(allRestaurants)

    const menuRestaurants = getMenuRestaurants()
    const linkRestaurants = getLinkRestaurants()

    const allTags = collectTags(menuRestaurants)
    loadFilters(allTags)
    buildFilterButtons(allTags)

    const elapsed = Date.now() - loadStart
    if (elapsed < 200) await new Promise((r) => setTimeout(r, 200 - elapsed))

    const dataWeekDates = getDataWeekDates(menuRestaurants)
    const isCurrentWeek = isDataFromCurrentWeek(menuRestaurants)
    renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, activeDay)

    renderDayPanels(contentEl, menuRestaurants, linkRestaurants, activeDay)
    carouselSwitchTo(activeDay)
    const activeIdx = carouselGetActiveIndex()
    if (activeIdx > 0) {
      const carousel = document.getElementById("carousel")
      if (carousel) carousel.scrollLeft = activeIdx * carousel.offsetWidth
    }
    moveInlineMap(DAYS[carouselGetActiveIndex()], carouselGetActivePanel)
    refreshPanel()

    if (isWeekend) renderWeekendState(showCarouselForDay)
    else if (!isCurrentWeek) renderStaleDataState(activeDay, showCarouselForDay)

    if (!document.getElementById("map-card")?.classList.contains("map-collapsed")) {
      initInlineMap(getAllRestaurants())
    }

    setupTabSwitching(tabsEl)
    setupFilterListeners(filtersEl, () => refreshPanel())
    setupCollapseExpand(contentEl)
    setupSearchListeners({
      getActiveDay: () => DAYS[carouselGetActiveIndex()],
      getMenuRestaurants,
      isFilterShowAll,
      itemMatchesFilters,
    })
    setupMapListeners(getAllRestaurants())

    document.addEventListener("keydown", (e) => {
      if ((e.target as Element).closest("input, textarea, [contenteditable]")) return
      if (isOverlayOpen()) return
      const k = e.key.toLowerCase()
      if (k === "i") document.getElementById("feedback-link")?.click()
      else if (k === "l") document.getElementById("language-toggle")?.click()
      else if (k === "r") window.location.reload()
    })

    carouselAttach()
    renderFooter(getLatestFetchTime(menuRestaurants), footerEl)

    // Share setup (after initI18n so t() works)
    shareSetup({
      title: config.title,
      subtitle: config.subtitle,
      logo: document.querySelector<HTMLElement>(".toolbar-logo"),
      getSelectionData: () => getShareSelectionData(carouselGetActivePanel),
      onClear: () => flushPendingRefresh(applyRefresh),
    })

    // Language toggle
    setupLanguageToggle(async () => {
      updateTranslatedUI()
      renderFooter(getLatestFetchTime(_restaurants), footerEl)

      try {
        const newData = await fetchMenuData(getCurrentLanguage(), getSourceLanguage())
        applyRefresh(newData)
        renderFooter(getLatestFetchTime(newData), footerEl)
      } catch {
        // Keep existing data on failure
      }
    })

    // Auto-refresh polling
    startAutoRefresh(
      () => _restaurants,
      () => shareIsActive(),
      applyRefresh
    )
  } catch (err) {
    contentEl.innerHTML = `<div class="error-global">${escapeHtml(t('error.loading', { message: (err as Error).message }))}</div>`
  }
}

/* ── Setup & boot ─────────────────────────────────────── */

// Party mode runs before init
setupPartyMode()

// Carousel setup with onDayChange callback
carouselSetup({
  days: DAYS,
  onDayChange(day) {
    shareClearSelection()
    moveInlineMap(day, carouselGetActivePanel)
    refreshPanel()
    flushPendingRefresh(applyRefresh)
  },
})

// Dice setup
diceSetup({
  smoothScrollTo,
  saveCollapsed,
  getActivePanel: carouselGetActivePanel,
})

// Theme toggle
setupThemeToggle()

// Run init
init()

// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {})
}
