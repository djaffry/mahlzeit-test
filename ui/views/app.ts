import { config } from "../config"
import { DAYS, LANG_CHANGE_EVENT } from "../constants"
import type { Restaurant } from "../types"

import { fetchMenuData, fetchLanguages } from "../data/fetcher"
import {
  initI18n,
  getCurrentLanguage,
  getSourceLanguage,
  getNextLanguage,
  setLanguage,
  t,
} from "../i18n/i18n"
import { initContentHash, startAutoRefresh } from "../data/auto-refresh"

import { loadTagsFromUrl, collectTags } from "../utils/tag-utils"
import {
  getDataWeekDates,
  getLatestFetchTime,
  todayDayIndex,
} from "../utils/date"
import { smoothScrollTo, isDesktop, isOverlayOpen } from "../utils/dom"
import { initTabBadge, onVoteReceived } from "../utils/tab-badge"

import {
  initVoting,
  acceptVoting,
  isVotingActive,
  getVoteMap,
  setOnVoteChange,
  getJoinResult,
  getActiveRoom,
  getTodayVoteDate,
} from "../voting/init"
import { markSaved, hasPending } from "../voting/vote-indicator"
import { icons } from "../icons"
import { closeAllOverlays } from "../components/overlay/overlay"
import { showConsentOverlay, isConsentSeen, markConsentSeen } from "../voting/consent"
import { showShortcutsModal } from "../components/shortcuts-modal/shortcuts-modal"
import { updateStaleBanner } from "../components/stale-banner/stale-banner"
import { renderFooter } from "../components/footer/footer"
import { setupHeaderScroll } from "../components/header-scroll/header-scroll"
import { handleDeepLink } from "../components/deep-link/deep-link"
import { showAvatarBadge } from "../components/avatar-badge/avatar-badge"
import { renderTimeline, expandDay, collapseAllExceptToday, rerenderExpandedDays, updateVotes } from "../components/timeline/timeline"
import { setupMoreMenu, closeMenu } from "../components/more-menu/more-menu"
import {
  loadFilters,
  initFilters,
  openFilterSelector,
  updateFilterDot,
  isFilterShowAll,
  getEffectiveFilters,
} from "../components/filter-bar/filter-bar"
import { setupSearch, openSearch, updateSearchRestaurants, closeSearch } from "../components/search/search"
import { cycleTheme } from "../components/theme-toggle/theme-toggle"
import { loadFavorites } from "../components/favorites/favorites"
import {
  renderLoadingState,
  renderErrorState,
} from "../components/empty-state/empty-state"
import { createSidebarToc, updateTocRestaurants, updateTocLanguage, refreshObservedTargets } from "../components/sidebar-toc/sidebar-toc"
import { setupMapPanel, toggleMapPanel, closeMapPanel, updateMapRestaurants, isMapPanelOpen, flyToRestaurant } from "../components/map-panel/map-panel"
import { setup as setupShare, isActive as isShareActive, SHARE_PANEL_EVENT } from "../components/share/share"
import { getShareSelectionData } from "../components/share/share-data"
import { openVotingRoomsPanel } from "../components/voting-rooms-panel/voting-rooms-panel"
import { setup as diceSetup, roll as diceRoll, isAvailable as isDiceAvailable } from "../components/dice/dice"

import { setupKeyboard } from "./keyboard"
import { registerSearchKeyboard } from "../components/search/search.keyboard"
import { registerMapKeyboard } from "../components/map-panel/map-panel.keyboard"
import { registerDiceKeyboard } from "../components/dice/dice.keyboard"
import { createToggleVote } from "./voting-flow"

/* ── State ───────────────────────────────────────────────── */

let _restaurants: Restaurant[] = []

function getMenuRestaurants(): Restaurant[] {
  return _restaurants.filter((r) => r.type !== "link")
}

function getActiveFilters(): Set<string> | null {
  return isFilterShowAll() ? null : getEffectiveFilters()
}

function onDayRender(): void {
  if (isDesktop()) refreshObservedTargets()
}

function updateTitle(): void {
  document.title = `${config.title} - ${config.subtitle}`
  initTabBadge(document.title)
}

function applyLanguageUI(): void {
  const toggle = document.getElementById("lang-toggle")
  if (toggle) toggle.textContent = getCurrentLanguage().toUpperCase()
  updateTitle()
  updateAriaLabels()
  document.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT))
}

async function switchLanguage(): Promise<void> {
  const prevLang = getCurrentLanguage()
  setLanguage(getNextLanguage())
  applyLanguageUI()
  try {
    applyRefresh(await fetchMenuData(getCurrentLanguage(), getSourceLanguage()))
  } catch {
    // Rollback so strings stay consistent with the data shown
    setLanguage(prevLang)
    applyLanguageUI()
  }
}

function updateAriaLabels(): void {
  const menu = document.getElementById("more-menu-trigger")
  if (menu) menu.setAttribute("aria-label", t("more.ariaLabel") ?? "Menu")
  const input = document.getElementById("search-input") as HTMLInputElement | null
  if (input) input.placeholder = t("search.placeholder")
}

/* ── Voting ──────────────────────────────────────────────── */

const toggleVote = createToggleVote({
  rerender,
  updateVotes,
  openVotingRoomsPanel,
})

/* ── Render ──────────────────────────────────────────────── */

function rerender(): void {
  const timelineEl = document.getElementById("timeline")!
  const weekDates = getDataWeekDates(getMenuRestaurants())

  renderTimeline(timelineEl, {
    restaurants: _restaurants,
    weekDates,
    getVotes: getVoteMap,
    getFilters: getActiveFilters,
    onVote: toggleVote,
    onDayRender,
  })
}

/* ── Data refresh ────────────────────────────────────────── */

function applyRefresh(newData: Restaurant[]): void {
  _restaurants = newData
  initContentHash(newData)

  const menuRestaurants = getMenuRestaurants()
  loadFilters(collectTags(menuRestaurants))
  updateFilterDot()
  updateSearchRestaurants(menuRestaurants)
  updateMapRestaurants(_restaurants)

  const weekDates = getDataWeekDates(menuRestaurants)
  updateStaleBanner(menuRestaurants)
  rerender()

  if (isDesktop()) {
    updateTocLanguage(weekDates)
    DAYS.forEach((dayName, i) => updateTocRestaurants(i, _restaurants, dayName))
    refreshObservedTargets()
  }

  const footerEl = document.getElementById("footer")
  if (footerEl) renderFooter(getLatestFetchTime(menuRestaurants), footerEl)
}

/* ── Init ────────────────────────────────────────────────── */

function setupBranding(brandIconEl: HTMLElement, brandLinkEl: HTMLElement): void {
  brandIconEl.innerHTML = icons.bird

  const reloadTrigger = document.getElementById("reload-trigger")
  if (reloadTrigger) {
    reloadTrigger.innerHTML = icons.rotateCcw
    reloadTrigger.addEventListener("click", () => location.reload())
  }

  brandLinkEl.addEventListener("click", (e) => {
    e.preventDefault()
    const idx = todayDayIndex()
    if (idx >= 0) expandDay(idx)
    else window.scrollTo({ top: 0, behavior: "smooth" })
  })
}

function setupLanguageToggle(): void {
  const langToggle = document.getElementById("lang-toggle")
  if (langToggle) {
    langToggle.textContent = getCurrentLanguage().toUpperCase()
    langToggle.addEventListener("click", () => switchLanguage())
  }
}

function setupFilterTrigger(): void {
  const filterTrigger = document.getElementById("filter-trigger")
  if (filterTrigger) {
    filterTrigger.innerHTML = icons.filter
    filterTrigger.addEventListener("click", () => openFilterSelector())
  }
}

function setupVotingUI(): void {
  setOnVoteChange((changedDate) => {
    const hadPending = hasPending()
    updateVotes()
    showAvatarBadge()
    if (hadPending) markSaved()

    if (changedDate !== null) {
      const isForToday = changedDate === getTodayVoteDate()
      onVoteReceived(isForToday, hadPending)
    }
  })
  const showAcceptOnlyConsent = () => showConsentOverlay({ onAccept: async () => { await acceptVoting() } })
  document.getElementById("avatar-badge")?.addEventListener("click", () => {
    if (isVotingActive()) openVotingRoomsPanel()
    else showAcceptOnlyConsent()
  })
  document.addEventListener(LANG_CHANGE_EVENT, showAvatarBadge)
  initVoting(() => _restaurants).then(() => {
    showAvatarBadge()
    const joinResult = getJoinResult()
    if (joinResult && isVotingActive()) {
      openVotingRoomsPanel({ banner: joinResult })
    } else if (!isVotingActive() && (joinResult || !isConsentSeen())) {
      markConsentSeen()
      showAcceptOnlyConsent()
    }
  }).catch((err) => {
    console.warn("[voting] init failed:", err)
    showAvatarBadge()
  })
}

function setupDesktopUI(weekDates: Date[]): void {
  if (!isDesktop()) return
  const tocEl = createSidebarToc(weekDates, { expandDay })
  document.body.appendChild(tocEl)
  DAYS.forEach((dayName, i) => updateTocRestaurants(i, _restaurants, dayName))
  refreshObservedTargets()
}

function setupGlobalListeners(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement
    const flyBtn = target.closest(".map-fly-btn") as HTMLElement | null
    if (flyBtn) {
      const id = flyBtn.dataset.flyId
      if (id) flyToRestaurant(id)
    }
    if (target.closest("[data-action='reload']")) location.reload()
  })
}

export async function initApp(): Promise<void> {
  const timelineEl = document.getElementById("timeline")!
  const footerEl = document.getElementById("footer")!
  const brandIconEl = document.getElementById("brand-icon")!
  const brandLinkEl = document.getElementById("brand-link")!

  setupBranding(brandIconEl, brandLinkEl)
  timelineEl.innerHTML = renderLoadingState()

  const languages = await fetchLanguages()
  initI18n(languages)
  updateTitle()

  setupLanguageToggle()
  setupFilterTrigger()

  try {
    const [, allRestaurants] = await Promise.all([
      loadTagsFromUrl(`${config.dataPath}/tags.json`),
      fetchMenuData(getCurrentLanguage(), getSourceLanguage()),
    ])

    _restaurants = allRestaurants
    initContentHash(allRestaurants)
    loadFavorites()

    const menuRestaurants = getMenuRestaurants()
    const weekDates = getDataWeekDates(menuRestaurants)

    loadFilters(collectTags(menuRestaurants))
    initFilters(rerenderExpandedDays)

    setupSearch({
      overlay: document.getElementById("search-overlay")!,
      input: document.getElementById("search-input") as HTMLInputElement,
      results: document.getElementById("search-results")!,
      restaurants: menuRestaurants,
      onNavigate: (restaurantId, dayIndex) => {
        expandDay(dayIndex)
        requestAnimationFrame(() => {
          const section = document.getElementById(`r-${dayIndex}-${restaurantId}`)
          if (section) smoothScrollTo(section)
        })
      },
      getActiveFilters: getActiveFilters,
    })

    setupMoreMenu(
      document.getElementById("more-menu-overlay")!,
      document.getElementById("more-menu")!,
      document.getElementById("more-menu-trigger")!,
      {
        onSearch: openSearch,
        onMap: toggleMapPanel,
        onDice: diceRoll,
        isDiceAvailable,
        onVotingRooms: openVotingRoomsPanel,
        onTheme: cycleTheme,
        onFeedback: () => window.open("https://github.com/djaffry/mahlzeit-test/issues/new/choose", "_blank"),
        onShortcuts: showShortcutsModal,
      },
    )

    updateStaleBanner(menuRestaurants)
    rerender()

    setupMapPanel(_restaurants)

    setupShare({
      title: config.title,
      subtitle: config.subtitle,
      logo: document.querySelector(".header-icon svg"),
      getSelectionData: () => getShareSelectionData(() => document.getElementById("timeline")),
      onClear: () => rerender(),
    })

    document.addEventListener(SHARE_PANEL_EVENT, ((e: CustomEvent<{ visible: boolean; height: number }>) => {
      if (e.detail.visible) {
        timelineEl.style.paddingBottom = e.detail.height + "px"
      } else {
        timelineEl.style.paddingBottom = ""
      }
    }) as EventListener)

    setupVotingUI()
    setupDesktopUI(weekDates)

    diceSetup({ getAllRestaurants: () => _restaurants, expandDay })
    setupHeaderScroll()

    registerSearchKeyboard({ openSearch })
    registerMapKeyboard({ toggleMapPanel, closeMapPanel, isMapPanelOpen })
    registerDiceKeyboard({ diceRoll, isDiceAvailable })

    setupKeyboard({
      expandDay,
      collapseAllExceptToday,
      openFilterSelector,
      openVotingRoomsPanel,
      cycleTheme,
      showShortcutsModal,
      switchLanguage,
      closeSearch,
      closeMenu,
      closeAllOverlays,
    })

    setupGlobalListeners()

    startAutoRefresh(() => _restaurants, () => isShareActive() || isOverlayOpen(), applyRefresh)
    renderFooter(getLatestFetchTime(menuRestaurants), footerEl)

    handleDeepLink({ expandDay })
  } catch (err) {
    timelineEl.innerHTML = renderErrorState(t("error.loading", { message: (err as Error).message }))
  }
}
