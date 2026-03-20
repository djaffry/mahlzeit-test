/* ── Forkcast — app entry point ────────────────────────── */

// CSS — style.css is loaded from index.html <head> to prevent FOUC.
// Component CSS is imported here (Vite bundles it into the main CSS chunk).
import "./styles/carousel.css"
import "./styles/dice.css"
import "./styles/share.css"

// Config & constants
import { config } from "./config"
import { DAYS, DAY_SHORT } from "./constants"
import type { Restaurant } from "./types"

// Data layer
import { fetchMenuData } from "./data/fetcher"
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
  refreshIndicator as carouselRefreshIndicator,
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
  isWeekend: boolean,
  activeDay: string
): void {
  tabsEl.innerHTML =
    DAYS.map((d, i) => {
      const cls = ["tab"]
      if (d === today) cls.push("today")
      if (!isWeekend && d === activeDay) cls.push("active")
      const date = formatShortDate(weekDates[i])
      return `<button class="${cls.join(" ")}" data-day="${d}"><span class="tab-full">${d} <span class="tab-date">${date}</span></span><span class="tab-short">${DAY_SHORT[d]} <span class="tab-date">${date}</span></span><kbd class="kbd">${i + 1}</kbd></button>`
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
  const pageLoadTime = new Date().toLocaleString("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const fetchTime = latest
    ? new Date(latest).toLocaleString("de-AT", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null
  footerEl.innerHTML = fetchTime
    ? `Seite geladen: ${escapeHtml(pageLoadTime)}<br>Daten abgerufen: ${fetchTime}`
    : `Seite geladen: ${escapeHtml(pageLoadTime)}`
}

/* ── Show carousel for a specific day (browse button) ── */

function showCarouselForDay(day: string): void {
  const carousel = document.getElementById("carousel")
  if (carousel) carousel.style.display = ""
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
    if (!e.target.closest(".restaurant-collapse-icon")) return
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
    document.getElementById("weekend-state")?.remove()
    document.getElementById("stale-state")?.remove()
    const carousel = document.getElementById("carousel")
    const wasHidden = carousel?.style.display === "none"
    if (wasHidden && carousel) carousel.style.display = ""

    window.scrollTo({ top: 0, behavior: "smooth" })
    document.querySelectorAll(".dice-pick").forEach((el) => el.classList.remove("dice-pick"))

    moveInlineMap(day, carouselGetActivePanel)
    refreshPanel()
    if (wasHidden) carouselRefreshIndicator()
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

  // 2. Clear transient state
  document.querySelectorAll(".dice-pick").forEach((el) => el.classList.remove("dice-pick"))
  document.querySelectorAll(".share-selected").forEach((el) => el.classList.remove("share-selected"))
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
  const isWeekend = !today
  const dataWeekDates = getDataWeekDates(menuRestaurants)
  const isCurrentWeek = isDataFromCurrentWeek(menuRestaurants)
  renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, isWeekend, activeTab)

  // 5. Re-render panels
  renderDayPanels(contentEl, menuRestaurants, linkRestaurants, activeTab)

  // Restore carousel scroll position (DOM was rebuilt)
  carouselRestorePosition(DAYS.indexOf(activeTab as (typeof DAYS)[number]))
  moveInlineMap(DAYS[carouselGetActiveIndex()], carouselGetActivePanel)

  // 6. Rebuild filters
  const allTags = collectTags(menuRestaurants)
  loadFilters(allTags)
  buildFilterButtons(allTags)

  // 7. Instant reveal
  refreshPanel(true)

  // Re-attach carousel listeners (DOM was rebuilt)
  carouselAttach()

  // 8. Restore scroll
  window.scrollTo(0, scrollY)

  // 9. Rebuild map if visible
  const mapCard = document.getElementById("map-card")
  if (mapCard && !mapCard.classList.contains("map-collapsed")) {
    rebuildInlineMap(getAllRestaurants())
  }

  // 10. Re-evaluate stale/weekend overlay
  if (isWeekend) {
    renderWeekendState(contentEl, showCarouselForDay)
  } else if (!isCurrentWeek) {
    renderStaleDataState(contentEl, activeTab, showCarouselForDay)
  }
}

/* ── Init ─────────────────────────────────────────────── */

async function init(): Promise<void> {
  const tabsEl = document.getElementById("day-tabs")!
  const contentEl = document.getElementById("content")!
  const footerEl = document.getElementById("footer")!
  const filtersEl = document.getElementById("filters")!
  const today = getTodayName()
  const isWeekend = !today
  const activeDay = today || DAYS[0]
  const weekDates = getWeekDates()

  renderDayTabs(tabsEl, weekDates, today, isWeekend, activeDay)

  // Show skeleton while loading
  renderSkeleton(contentEl)

  try {
    const loadStart = Date.now()
    const [, allRestaurants] = await Promise.all([
      loadTagsFromUrl(`${config.dataPath}/tags.json`),
      fetchMenuData(),
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
    renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, isWeekend, activeDay)

    renderDayPanels(contentEl, menuRestaurants, linkRestaurants, activeDay)
    carouselSwitchTo(activeDay)
    const activeIdx = carouselGetActiveIndex()
    if (activeIdx > 0) {
      const carousel = document.getElementById("carousel")
      if (carousel) carousel.scrollLeft = activeIdx * carousel.offsetWidth
    }
    moveInlineMap(DAYS[carouselGetActiveIndex()], carouselGetActivePanel)
    refreshPanel()

    const carouselHidden = isWeekend || !isCurrentWeek
    if (isWeekend) renderWeekendState(contentEl, showCarouselForDay)
    else if (!isCurrentWeek) renderStaleDataState(contentEl, activeDay, showCarouselForDay)

    if (!carouselHidden && !document.getElementById("map-card")?.classList.contains("map-collapsed")) {
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
      else if (k === "r") window.location.reload()
    })

    carouselAttach()
    renderFooter(getLatestFetchTime(menuRestaurants), footerEl)

    // Auto-refresh polling
    startAutoRefresh(
      () => _restaurants,
      () => shareIsActive(),
      applyRefresh
    )
  } catch (err) {
    contentEl.innerHTML = `<div class="error-global">Fehler beim Laden: ${escapeHtml((err as Error).message)}</div>`
  }
}

/* ── Setup & boot ─────────────────────────────────────── */

// Set document title and toolbar text from config
document.title = config.title + " - " + config.subtitle
const toolbarTitle = document.querySelector(".toolbar-title")
if (toolbarTitle) toolbarTitle.textContent = config.title
const toolbarSubtitle = document.querySelector(".toolbar-subtitle")
if (toolbarSubtitle) toolbarSubtitle.textContent = config.subtitle

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

// Share setup
shareSetup({
  title: document.querySelector(".toolbar-title")?.textContent?.trim() ?? config.title,
  subtitle: document.querySelector(".toolbar-subtitle")?.textContent?.trim() ?? config.subtitle,
  logo: document.querySelector<HTMLElement>(".toolbar-logo"),
  getSelectionData: () => getShareSelectionData(carouselGetActivePanel),
  onClear: () => flushPendingRefresh(applyRefresh),
})

// Theme toggle
setupThemeToggle()

// Run init
init()

// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {})
}
