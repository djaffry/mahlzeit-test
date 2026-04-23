import "./more-menu.css"
import { icons } from "../../icons"
import { t } from "../../i18n/i18n"
import { LANG_CHANGE_EVENT } from "../../constants"
import { registerOverlay, unregisterOverlay, escapeHtml } from "../../utils/dom"
import { fetchArchiveWeeks, enterArchive, exitArchive, formatWeekLabel, getArchiveWeek, isArchiveMode } from "../../archive/archive"

export interface MoreMenuCallbacks {
  onSearch: () => void
  onMap: () => void
  onDice: () => void
  isDiceAvailable: () => boolean
  onVotingRooms: () => void
  onTheme: () => void
  onFeedback: () => void
  onShortcuts: () => void
}

let _state: {
  overlay: HTMLElement
  menu: HTMLElement
  callbacks: MoreMenuCallbacks
  ac: AbortController
} | null = null

let _openAc: AbortController | null = null
let _archiveExpanded = false
let _archiveWeeks: string[] = []

export function setupMoreMenu(
  overlay: HTMLElement,
  menu: HTMLElement,
  trigger: HTMLElement,
  callbacks: MoreMenuCallbacks,
): void {
  _state?.ac.abort()

  const ac = new AbortController()
  _state = { overlay, menu, callbacks, ac }
  const { signal } = ac

  trigger.innerHTML = icons.menu

  trigger.addEventListener("click", () => {
    if (overlay.hidden) openMenu()
    else closeMenu()
  }, { signal })

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeMenu()
  }, { signal })

  menu.addEventListener("click", handleMenuClick, { signal })
}

function visibleArchiveWeeks(): string[] {
  const current = getArchiveWeek()
  return current ? _archiveWeeks.filter(w => w !== current) : _archiveWeeks
}

function renderArchiveSubmenu(): string {
  if (!_archiveExpanded) return ""
  const weeks = visibleArchiveWeeks()
  if (weeks.length === 0) return ""
  const items = weeks.map((week) => {
    const label = escapeHtml(formatWeekLabel(week))
    return `<button class="more-menu-item more-menu-sub" data-action="archive-week" data-week="${escapeHtml(week)}">
      <span class="more-menu-label">${label}</span>
    </button>`
  }).join("")
  return `<div id="archive-submenu">${items}</div>`
}

function renderMenuContent(): void {
  if (!_state) return
  const diceItem = _state.callbacks.isDiceAvailable()
    ? `<button class="more-menu-item" data-action="dice">${icons.dices} <span class="more-menu-label">${escapeHtml(t("dice.title") ?? "Random pick")}</span> <kbd>D</kbd></button>`
    : ""

  const archiveItem = visibleArchiveWeeks().length > 0
    ? `<div class="more-menu-separator"></div>
       <button class="more-menu-item more-menu-has-sub${_archiveExpanded ? " expanded" : ""}" data-action="archive-toggle" aria-expanded="${_archiveExpanded}" aria-controls="archive-submenu">
         ${icons.history}
         <span class="more-menu-label">${escapeHtml(t("archive.menuItem") ?? "Archive")}</span>
         <span class="more-menu-caret">${icons.chevronRight}</span>
       </button>
       ${renderArchiveSubmenu()}`
    : ""

  const votingRoomsItem = isArchiveMode()
    ? ""
    : `<button class="more-menu-item" data-action="voting-rooms">${icons.heart} <span class="more-menu-label">${escapeHtml(t("voting.rooms") ?? "Voting rooms")}</span> <kbd>V</kbd></button>`

  const backToCurrentItem = isArchiveMode()
    ? `<button class="more-menu-item" data-action="archive-back">${icons.arrowLeft} <span class="more-menu-label">${escapeHtml(t("archive.backToCurrentWeek"))}</span></button>`
    : ""

  _state.menu.innerHTML = `
    <button class="more-menu-item" data-action="search">${icons.search} <span class="more-menu-label">${escapeHtml(t("search.title") ?? "Search")}</span> <kbd>/</kbd></button>
    <button class="more-menu-item" data-action="map">${icons.map} <span class="more-menu-label">${escapeHtml(t("map.title") ?? "Map")}</span> <kbd>M</kbd></button>
    ${diceItem}
    ${votingRoomsItem}
    ${backToCurrentItem}
    ${archiveItem}
    <div class="more-menu-separator"></div>
    <button class="more-menu-item" data-action="theme">${icons.sunMoon} <span class="more-menu-label">${escapeHtml(t("theme.toggle") ?? "Switch theme")}</span> <kbd>T</kbd></button>
    <div class="more-menu-separator"></div>
    <button class="more-menu-item" data-action="feedback">${icons.messageSquare} <span class="more-menu-label">${escapeHtml(t("feedback.title") ?? "Feedback")}</span></button>
    <button class="more-menu-item desktop-only" data-action="shortcuts">${icons.keyboard} <span class="more-menu-label">${escapeHtml(t("shortcuts.title") ?? "Shortcuts")}</span> <kbd>?</kbd></button>
  `
}

function openMenu(): void {
  if (!_state) return

  _archiveExpanded = false
  renderMenuContent()

  // First-open triggers the archive-manifest fetch (cached); subsequent opens are instant.
  fetchArchiveWeeks().then((weeks) => {
    _archiveWeeks = weeks
    if (_state && !_state.overlay.hidden) renderMenuContent()
  })

  _state.overlay.hidden = false
  registerOverlay("more-menu")
  requestAnimationFrame(() => _state?.overlay.classList.add("visible"))

  _openAc = new AbortController()
  document.addEventListener(LANG_CHANGE_EVENT, renderMenuContent, { signal: _openAc.signal })
}

function handleMenuClick(e: Event): void {
  const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null
  if (!btn || !_state) return

  const action = btn.dataset.action

  if (action === "archive-toggle") {
    _archiveExpanded = !_archiveExpanded
    renderMenuContent()
    return  // stay open
  }

  if (action === "archive-week") {
    const week = btn.dataset.week
    if (week) enterArchive(week)
    return  // navigation — no close needed
  }

  if (action === "archive-back") {
    exitArchive()
    return  // navigation — no close needed
  }

  const cb = _state.callbacks
  closeMenu()

  switch (action) {
    case "search": cb.onSearch(); break
    case "map": cb.onMap(); break
    case "dice": cb.onDice(); break
    case "voting-rooms": cb.onVotingRooms(); break
    case "theme": cb.onTheme(); break
    case "feedback": cb.onFeedback(); break
    case "shortcuts": cb.onShortcuts(); break
  }
}

export function closeMenu(): void {
  if (!_state) return
  _openAc?.abort()
  _openAc = null
  _archiveExpanded = false
  unregisterOverlay("more-menu")
  _state.overlay.classList.remove("visible")
  _state.overlay.hidden = true
}
