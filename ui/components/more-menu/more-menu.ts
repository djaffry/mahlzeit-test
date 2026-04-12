import "./more-menu.css"
import { icons } from "../../icons"
import { t } from "../../i18n/i18n"
import { LANG_CHANGE_EVENT } from "../../constants"
import { registerOverlay, unregisterOverlay, escapeHtml } from "../../utils/dom"

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

function renderMenuContent(): void {
  if (!_state) return
  const diceItem = _state.callbacks.isDiceAvailable()
    ? `<button class="more-menu-item" data-action="dice">${icons.dices} <span class="more-menu-label">${escapeHtml(t("dice.title") ?? "Random pick")}</span> <kbd>D</kbd></button>`
    : ""
  _state.menu.innerHTML = `
    <button class="more-menu-item" data-action="search">${icons.search} <span class="more-menu-label">${escapeHtml(t("search.title") ?? "Search")}</span> <kbd>/</kbd></button>
    <button class="more-menu-item" data-action="map">${icons.map} <span class="more-menu-label">${escapeHtml(t("map.title") ?? "Map")}</span> <kbd>M</kbd></button>
    ${diceItem}
    <button class="more-menu-item" data-action="voting-rooms">${icons.heart} <span class="more-menu-label">${escapeHtml(t("voting.rooms") ?? "Voting rooms")}</span> <kbd>V</kbd></button>
    <div class="more-menu-separator"></div>
    <button class="more-menu-item" data-action="theme">${icons.sunMoon} <span class="more-menu-label">${escapeHtml(t("theme.toggle") ?? "Switch theme")}</span> <kbd>T</kbd></button>
    <div class="more-menu-separator"></div>
    <button class="more-menu-item" data-action="feedback">${icons.messageSquare} <span class="more-menu-label">${escapeHtml(t("feedback.title") ?? "Feedback")}</span></button>
    <button class="more-menu-item desktop-only" data-action="shortcuts">${icons.keyboard} <span class="more-menu-label">${escapeHtml(t("shortcuts.title") ?? "Shortcuts")}</span> <kbd>?</kbd></button>
  `
}

function openMenu(): void {
  if (!_state) return

  renderMenuContent()

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
  unregisterOverlay("more-menu")
  _state.overlay.classList.remove("visible")
  _state.overlay.hidden = true
}
