import "./share.css"
import { escapeHtml, clearPersistentHighlight } from "../../utils/dom"
import { haptic } from "../../utils/haptic"
import { icons, restaurantIconSpan } from "../../icons"
import { t } from "../../i18n/i18n"
import { registerShortcut } from "../../utils/keyboard-registry"
import { exportImage, showToast, formatAsText, buildDeepLink, allSections } from "./share-export"

import type { ShareSection, ShareSelectionData } from "./share-types"
import { renderShareImage, initLogos, setTitles } from "./share-canvas"
import { formatDayLabel, formatBadges } from "./share-format"

/* ── Constants ─────────────────────────────────────────── */

const VIBRATE_MS = 8
const SHARE_PANEL_EVENT = "peckish:share-panel-toggle"

/* ── Module state ──────────────────────────────────────── */

let _state: {
  selectionBar: HTMLElement
  getSelectionData: () => ShareSelectionData | null
  onClear: () => void
  ac: AbortController
  unregisterShortcuts: (() => void)[]
} | null = null

/* ── Public API ───────────────────────────────────────── */

export function setup(deps: {
  title: string
  subtitle: string
  logo: HTMLElement | null
  getSelectionData: () => ShareSelectionData | null
  onClear: () => void
}): void {
  _state?.ac.abort()
  _state?.unregisterShortcuts.forEach(fn => fn())
  _state?.selectionBar.remove()

  const { title, subtitle, logo, getSelectionData, onClear } = deps
  setTitles(title, subtitle)
  if (logo) initLogos(logo)

  const selectionBar = createSharePanel()
  const ac = new AbortController()

  _state = {
    selectionBar,
    getSelectionData,
    onClear,
    ac,
    unregisterShortcuts: [
      registerShortcut({ key: "p", handler: () => shareSelectionAsPicture(), guard: isSelectionVisible }),
      registerShortcut({ key: "c", handler: () => shareSelectionAsText(), guard: isSelectionVisible }),
      registerShortcut({ key: "Escape", handler: () => clearSelection(), guard: isSelectionVisible }),
    ],
  }

  document.addEventListener("click", handleClick, { signal: ac.signal })
}

/* ── Selection & sharing ──────────────────────────────── */

function isSelectionVisible(): boolean {
  return _state?.selectionBar.classList.contains("visible") ?? false
}

function sectionItemCount(s: ShareSection): number {
  return s.categories.length === 0 ? 1 : s.categories.reduce((n, c) => n + c.items.length, 0)
}

function handleClick(event: Event): void {
  const target = event.target as Element
  if (target.closest('.share-panel-image')) { shareSelectionAsPicture(); return }
  if (target.closest('.share-panel-text'))  { shareSelectionAsText(); return }
  if (target.closest('.share-panel-clear')) { clearSelection(); return }

  // Menu item selection toggle (ignore clicks on links/buttons inside items)
  const menuItem = target.closest('.menu-item') as HTMLElement | null
  if (menuItem && !target.closest('a, button')) {
    menuItem.classList.toggle('selected')
    if (menuItem.classList.contains('selected')) clearPersistentHighlight()
    const card = menuItem.closest('.restaurant-section') as HTMLElement | null
    if (card) syncCardSelectedState(card)
    haptic(VIBRATE_MS)
    updateSelectionBar()
  }
}

async function shareSelectionAsPicture(): Promise<void> {
  const data = _state?.getSelectionData()
  if (!data) return
  const canvas = await renderShareImage(data)
  const sections = allSections(data)
  const filename = sections.length === 1 ? sections[0].restaurant : t('share.filename')
  const restaurantIds = sections.map(s => s.restaurant)
  const deepLink = buildDeepLink(restaurantIds, data.days[0]?.day ?? '')
  await exportImage(canvas, filename, deepLink)
  clearSelection()
}

async function shareSelectionAsText(): Promise<void> {
  const data = _state?.getSelectionData()
  if (!data) return
  const text = formatAsText(data)
  try {
    await navigator.clipboard.writeText(text)
    showToast(t('share.copied'), null, text)
  } catch {
    if (navigator.share) {
      try {
        await navigator.share({ text })
        clearSelection()
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') { clearSelection(); return }
      }
    }
    showToast(t('share.copyFailed'))
  }
  clearSelection()
}

export function clearSelection(): void {
  const scope = document.getElementById('timeline') ?? document
  scope.querySelectorAll('.selected, .share-any, .share-all').forEach(el => el.classList.remove('selected', 'share-any', 'share-all'))
  updateSelectionBar()
  _state?.onClear()
}

function syncCardSelectedState(card: HTMLElement): void {
  const allItems = card.querySelectorAll('.menu-item:not(.hidden)')
  let selected = 0
  for (const el of allItems) {
    if (el.classList.contains('selected')) selected++
  }
  card.classList.toggle('share-any', selected > 0)
  card.classList.toggle('share-all', allItems.length > 0 && selected === allItems.length)
}

/* ── Floating share panel ────────────────────────────── */

const MAX_VISIBLE_RESTAURANTS = 4

function createSharePanel(): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'share-panel'
  panel.setAttribute('role', 'status')
  panel.setAttribute('aria-live', 'polite')
  panel.innerHTML = `
    <div class="share-panel-header">
      <span class="share-panel-title">${escapeHtml(t('share.panelTitle'))}</span>
      <button class="icon-btn share-panel-clear" aria-label="${escapeHtml(t('share.clearSelection'))}">${icons.x}</button>
    </div>
    <div class="share-panel-restaurants"></div>
    <div class="share-panel-buttons">
      <button class="share-panel-btn share-panel-image" aria-label="${escapeHtml(t('share.asImage'))}">${icons.camera} ${escapeHtml(t('share.asImage'))}<kbd>P</kbd></button>
      <button class="share-panel-btn share-panel-text" aria-label="${escapeHtml(t('share.asText'))}">${icons.type} ${escapeHtml(t('share.asText'))}<kbd>C</kbd></button>
    </div>`
  document.body.appendChild(panel)
  return panel
}

function renderRestaurantSummary(data: ShareSelectionData): string {
  let rendered = 0
  let html = ''
  for (const dg of data.days) {
    if (rendered >= MAX_VISIBLE_RESTAURANTS) break
    const dayHeader = dg.day
      ? `<div class="share-panel-day-label">${escapeHtml(formatDayLabel(dg.day))}</div>`
      : ''
    let dayRows = ''
    for (const s of dg.sections) {
      if (rendered >= MAX_VISIBLE_RESTAURANTS) break
      const count = sectionItemCount(s)
      const countText = escapeHtml(count === 1 ? t('share.itemSingular') : t('share.itemCount', { count: String(count) }))
      const badgeHtml = s.badges.length ? ` <span class="share-panel-badges">${escapeHtml(formatBadges(s.badges))}</span>` : ''
      dayRows += `<div class="share-panel-restaurant">${restaurantIconSpan(s.icon)} <span>${escapeHtml(s.name)}</span>${badgeHtml} <span class="share-panel-restaurant-count">${countText}</span></div>`
      rendered++
    }
    if (dayRows) html += dayHeader + dayRows
  }

  const totalSections = allSections(data).length
  const overflow = totalSections - rendered
  if (overflow > 0) html += `<div class="share-panel-overflow">+${overflow}</div>`

  return html
}

function updateSelectionBar(): void {
  if (!_state) return
  const data = _state.getSelectionData()
  const sections = data ? allSections(data) : []
  let totalSelected = 0
  for (const s of sections) totalSelected += sectionItemCount(s)

  const visible = totalSelected > 0
  _state.selectionBar.classList.toggle('visible', visible)
  emitPanelToggle(visible)

  if (!visible) return

  const restaurantsEl = _state.selectionBar.querySelector('.share-panel-restaurants')
  if (restaurantsEl) restaurantsEl.innerHTML = renderRestaurantSummary(data!)
}

export function isActive(): boolean {
  return isSelectionVisible()
    || document.querySelector('.share-toast.visible') !== null
}

/* ── Timeline padding decoupling ─────────────────────── */

function emitPanelToggle(visible: boolean): void {
  if (visible && _state) {
    requestAnimationFrame(() => {
      const height = _state?.selectionBar.offsetHeight ?? 0
      document.dispatchEvent(new CustomEvent(SHARE_PANEL_EVENT, { detail: { visible: true, height } }))
    })
  } else {
    document.dispatchEvent(new CustomEvent(SHARE_PANEL_EVENT, { detail: { visible: false, height: 0 } }))
  }
}

export { SHARE_PANEL_EVENT }
