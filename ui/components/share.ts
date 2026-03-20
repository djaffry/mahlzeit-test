/* Share — select menu items, render to canvas, copy to clipboard or share */

import "../styles/share.css"
import { DAYS } from "../constants"
import { config } from "../config"
import { getMondayOfWeek } from "../utils/date"
import { isOverlayOpen } from "../utils/dom"
import { haptic } from "../utils/haptic"

/* ── Types ─────────────────────────────────────────────── */

export interface ShareSelectionData {
  day: string
  sections: {
    name: string
    cuisine: string
    badges: string[]
    restaurant: string
    categories: { name: string; items: { title: string; price: string; description: string; tags: string[] }[] }[]
  }[]
}

/* ── Constants ─────────────────────────────────────────── */

const CANVAS_WIDTH = 720
const PADDING = 36
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2
const LOGO_SIZE = 56
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// Catppuccin Mocha — consistent branding regardless of user theme
const COLOR = {
  bg:          '#1e1e2e',
  surface:     '#313244',
  text:        '#cdd6f4',
  secondary:   '#a6adc8',
  muted:       '#6c7086',
  accent:      '#f5c2e7',
  border:      '#45475a',
  borderLight: '#3b3c50',
}
const CARD_RADIUS = 12
const CARD_PADDING = 36

const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  Vegan:            { bg: 'rgba(166,227,161,0.18)', fg: '#a6e3a1' },
  Vegetarisch:      { bg: 'rgba(148,226,213,0.18)', fg: '#94e2d5' },
  Fisch:            { bg: 'rgba(137,180,250,0.18)', fg: '#89b4fa' },
  'Meeresfrüchte':  { bg: 'rgba(137,180,250,0.18)', fg: '#89b4fa' },
  'Geflügel':       { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
  Huhn:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
  Pute:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
  Ente:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
  Fleisch:          { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
  Lamm:             { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
  Schweinefleisch:  { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
  Rindfleisch:      { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
  Glutenfrei:       { bg: 'rgba(249,226,175,0.18)', fg: '#f9e2af' },
  Laktosefrei:      { bg: 'rgba(180,190,254,0.18)', fg: '#b4befe' },
}
const TAG_COLOR_DEFAULT = { bg: 'rgba(245,194,231,0.18)', fg: '#f5c2e7' }

const BADGE_COLORS: Record<string, string> = {
  Edenred:     '#f38ba8',
  Stempelkarte: '#f9e2af',
  Draußen:     '#94e2d5',
}

const TOAST_DURATION_MS = 2500
const VIBRATE_MS = 8

/* ── Module state ──────────────────────────────────────── */

let selectionBar: HTMLElement | null = null
let logoImage: HTMLImageElement | null = null
let headerTitle = config.title
let headerSubtitle = config.subtitle
let _getSelectionData: (() => ShareSelectionData | null) | null = null
let onClearCallback: (() => void) | null = null

/* ── Public API ───────────────────────────────────────── */

export function setup(deps: {
  title: string
  subtitle: string
  logo: HTMLElement | null
  getSelectionData: () => ShareSelectionData | null
  onClear: () => void
}): void {
  const { title, subtitle, logo, getSelectionData: selectionDataFn, onClear } = deps
  if (title) headerTitle = title
  if (subtitle) headerSubtitle = subtitle
  if (logo) prepareLogo(logo)
  if (selectionDataFn) _getSelectionData = selectionDataFn
  if (onClear) onClearCallback = onClear
  createSelectionBar()

  document.addEventListener('click', event => {
    const target = event.target as Element
    if (target.closest('.share-bar-picture')) { shareSelectionAsPicture(); return }
    if (target.closest('.share-bar-text'))    { shareSelectionAsText(); return }
    if (target.closest('.share-bar-clear'))   { clearSelection(); return }

    // Restaurant name click — select all / toggle link card
    const nameEl = target.closest('.restaurant-name')
    if (nameEl) {
      const card = nameEl.closest('.restaurant-card') as HTMLElement | null
      if (card && !card.classList.contains('map-card')) {
        const allItems = card.querySelectorAll<HTMLElement>('.menu-item:not(.hidden)')
        if (allItems.length === 0) {
          // Link card — toggle card-level selection
          card.classList.toggle('share-selected')
          if (card.classList.contains('share-selected')) card.classList.remove('dice-pick')
        } else {
          const allSelected = [...allItems].every(el => el.classList.contains('share-selected'))
          allItems.forEach(el => {
            el.classList.toggle('share-selected', !allSelected)
            if (!allSelected) el.classList.remove('dice-pick')
          })
          syncCardSelectedState(card)
        }
        haptic(VIBRATE_MS)
        updateSelectionBar()
      }
      return
    }

    // Menu item selection toggle (ignore clicks on links/buttons inside items)
    const menuItem = target.closest('.menu-item') as HTMLElement | null
    if (menuItem && !target.closest('a, button')) {
      menuItem.classList.toggle('share-selected')
      if (menuItem.classList.contains('share-selected')) menuItem.classList.remove('dice-pick')
      const card = menuItem.closest('.restaurant-card') as HTMLElement | null
      if (card) syncCardSelectedState(card)
      haptic(VIBRATE_MS)
      updateSelectionBar()
    }
  })

  document.addEventListener('keydown', e => {
    if (!selectionBar?.classList.contains('visible')) return
    if ((e.target as Element).closest('input, textarea, [contenteditable]')) return
    if (isOverlayOpen()) return
    const k = e.key.toLowerCase()
    if (k === 'p') shareSelectionAsPicture()
    else if (k === 't') shareSelectionAsText()
    else if (k === 'escape') clearSelection()
  })
}

export function renderShareImage(data: ShareSelectionData): HTMLCanvasElement {
  const measureCtx = document.createElement('canvas').getContext('2d')!
  const height = layoutCanvas(measureCtx, data, false)

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  fillRoundRect(ctx, 0, 0, CANVAS_WIDTH, height, 24, COLOR.bg)
  layoutCanvas(ctx, data, true)

  return canvas
}

/* ── Selection & sharing ──────────────────────────────── */

async function shareSelectionAsPicture(): Promise<void> {
  const data = _getSelectionData?.()
  if (!data) return
  const canvas = renderShareImage(data)
  const filename = data.sections.length === 1 ? data.sections[0].restaurant : 'auswahl'
  await exportImage(canvas, filename)
  clearSelection()
}

async function shareSelectionAsText(): Promise<void> {
  const data = _getSelectionData?.()
  if (!data) return
  const text = formatAsText(data)
  try {
    await navigator.clipboard.writeText(text)
    showToast('Text kopiert', null, text)
  } catch {
    // Clipboard blocked — try native share (Firefox Android, etc.)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        clearSelection()
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') { clearSelection(); return }
      }
    }
    showToast('Kopieren fehlgeschlagen')
  }
  clearSelection()
}

function formatAsText(data: ShareSelectionData): string {
  const lines: string[] = []
  if (data.day) lines.push(formatDayLabel(data.day))

  for (const restaurant of data.sections) {
    if (lines.length) lines.push('')
    lines.push(restaurant.name)

    for (const category of restaurant.categories) {
      for (const item of category.items) {
        const price = item.price ? `  ${item.price}` : ''
        lines.push(`- ${item.title.replace(/\n/g, ' ')}${price}`)
        if (item.description) lines.push(`  ${item.description}`)
      }
    }
  }

  lines.push('')
  lines.push(window.location.origin + window.location.pathname)

  return lines.join('\n')
}

export function clearSelection(): void {
  document.querySelectorAll('.share-selected').forEach(el => el.classList.remove('share-selected'))
  updateSelectionBar()
  if (onClearCallback) onClearCallback()
}

// Sync card-level share-selected when all items are selected/deselected
function syncCardSelectedState(card: HTMLElement): void {
  const allItems = card.querySelectorAll('.menu-item:not(.hidden)')
  const allSelected = allItems.length > 0 &&
    [...allItems].every(el => el.classList.contains('share-selected'))
  card.classList.toggle('share-selected', allSelected)
}

/* ── Floating selection bar ───────────────────────────── */

function createSelectionBar(): void {
  const bar = document.createElement('div')
  bar.className = 'share-bar'
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-live', 'polite')
  bar.innerHTML = `
    <span class="share-bar-label">Share</span>
    <span class="share-bar-count"></span>
    <div class="share-bar-actions">
      <button class="share-bar-picture" aria-label="Als Bild teilen (P)" title="Als Bild">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <kbd class="kbd">P</kbd>
      </button>
      <button class="share-bar-text" aria-label="Als Text kopieren (T)" title="Als Text">Txt<kbd class="kbd">T</kbd></button>
      <button class="share-bar-clear" aria-label="Auswahl aufheben (Esc)" title="Aufheben">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`
  document.body.appendChild(bar)
  selectionBar = bar
}

function updateSelectionBar(): void {
  if (!selectionBar) return
  const data = _getSelectionData?.()
  let totalSelected = 0
  if (data) {
    for (const section of data.sections) {
      if (section.categories.length === 0) {
        // Link card — counts as 1
        totalSelected += 1
      } else {
        for (const category of section.categories) {
          totalSelected += category.items.length
        }
      }
    }
  }
  const countLabel = selectionBar.querySelector('.share-bar-count')!
  countLabel.textContent = totalSelected === 1 ? '1 ausgewählt' : totalSelected + ' ausgewählt'
  selectionBar.classList.toggle('visible', totalSelected > 0)
}

export function isActive(): boolean {
  return document.querySelector('.share-selected') !== null
    || (selectionBar !== null && selectionBar.classList.contains('visible'))
    || document.querySelector('.share-toast.visible') !== null
}

/* ── Image export (clipboard / share / download) ──────── */

async function exportImage(canvas: HTMLCanvasElement, name: string): Promise<void> {
  const filename = (name || 'menu') + '.png'

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    // Try with Blob first (Chrome, Firefox)
    try {
      const blob = await canvasToBlob(canvas)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('In Zwischenablage kopiert', canvas)
      return
    } catch { /* fall through */ }

    // Try with Promise (Safari — preserves user activation)
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png')),
      })])
      showToast('In Zwischenablage kopiert', canvas)
      return
    } catch { /* fall through */ }
  }

  // Web Share API with file (Chrome Android, iOS Safari 15+)
  const blob = await canvasToBlob(canvas)
  const file = new File([blob], filename, { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        url: window.location.origin + window.location.pathname,
      })
      return
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
  }

  // Download fallback (Firefox Android, desktop without clipboard support)
  downloadBlob(blob, filename)
  showToast('Bild heruntergeladen', canvas)
}

function showToast(message: string, canvas?: HTMLCanvasElement | null, text?: string): void {
  const existing = document.querySelector('.share-toast')
  if (existing) existing.remove()
  const existingBackdrop = document.querySelector('.share-toast-backdrop')
  if (existingBackdrop) existingBackdrop.remove()

  const backdrop = document.createElement('div')
  backdrop.className = 'share-toast-backdrop'

  const toast = document.createElement('div')
  toast.className = 'share-toast'

  if (canvas) {
    const preview = document.createElement('img')
    preview.className = 'share-toast-preview'
    preview.src = canvas.toDataURL('image/png')
    toast.appendChild(preview)
  } else if (text) {
    const preview = document.createElement('pre')
    preview.className = 'share-toast-text-preview'
    preview.textContent = text
    toast.appendChild(preview)
  }

  const label = document.createElement('span')
  label.className = 'share-toast-label'
  label.textContent = message
  toast.appendChild(label)

  let dismissed = false
  function dismiss(): void {
    if (dismissed) return
    dismissed = true
    toast.classList.remove('visible')
    backdrop.classList.remove('visible')
    setTimeout(() => { toast.remove(); backdrop.remove() }, 400)
  }

  backdrop.addEventListener('click', dismiss)
  toast.addEventListener('click', dismiss)

  document.body.appendChild(backdrop)
  document.body.appendChild(toast)
  // Force layout so the browser registers the initial state before transitioning
  void toast.offsetHeight
  if (canvas) backdrop.classList.add('flash')
  backdrop.classList.add('visible')
  toast.classList.add('visible')
  setTimeout(dismiss, TOAST_DURATION_MS)
}

/* ── Canvas rendering ─────────────────────────────────── */

function layoutCanvas(ctx: CanvasRenderingContext2D, data: ShareSelectionData, draw: boolean): number {
  let y = PADDING

  // Header: logo + title + day
  const titleX = PADDING + LOGO_SIZE + 16
  if (draw && logoImage) ctx.drawImage(logoImage, PADDING, y, LOGO_SIZE, LOGO_SIZE)

  setFont(ctx, '700 28px')
  if (draw) { ctx.fillStyle = COLOR.accent; ctx.fillText(headerTitle, titleX, y + 24) }
  setFont(ctx, '20px')
  if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(headerSubtitle, titleX, y + 48) }

  if (data.day) {
    setFont(ctx, '22px')
    const dayLabel = formatDayLabel(data.day)
    const dayLabelWidth = ctx.measureText(dayLabel).width
    if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(dayLabel, CANVAS_WIDTH - PADDING - dayLabelWidth, y + 24) }
  }

  y += LOGO_SIZE + 24

  // Restaurant cards
  const restaurants = data.sections
  for (let ri = 0; ri < restaurants.length; ri++) {
    if (ri > 0) y += 24
    y = drawRestaurantCard(ctx, restaurants[ri], y, draw)
  }

  return y + PADDING
}

function drawRestaurantCard(
  ctx: CanvasRenderingContext2D,
  restaurant: ShareSelectionData['sections'][number],
  y: number,
  draw: boolean,
): number {
  // Measure card content height first (dry run)
  const contentHeight = measureCardContent(ctx, restaurant)
  const headerHeight = measureCardHeader(ctx, restaurant)
  const bodyTopPad = 12 // website 6px × 2
  const bodyBottomPad = CARD_PADDING // website 18px × 2
  const totalHeight = headerHeight + 1 + bodyTopPad + contentHeight + bodyBottomPad
  const cardWidth = CONTENT_WIDTH

  // Draw card background + border
  if (draw) {
    fillRoundRect(ctx, PADDING, y, cardWidth, totalHeight, CARD_RADIUS, COLOR.surface)
    strokeRoundRect(ctx, PADDING, y, cardWidth, totalHeight, CARD_RADIUS, COLOR.border)
  }

  let cy = y

  // Card header
  cy = drawCardHeader(ctx, restaurant, cy, draw)

  // Header separator
  if (draw) { ctx.fillStyle = COLOR.borderLight; ctx.fillRect(PADDING, cy, cardWidth, 1) }
  cy += 1

  // Card content
  cy += bodyTopPad
  cy = drawCardContent(ctx, restaurant, cy, draw)
  cy += bodyBottomPad

  return cy
}

function measureCardHeader(ctx: CanvasRenderingContext2D, restaurant: ShareSelectionData['sections'][number]): number {
  let h = 24 // header top padding (12px × 2)
  setFont(ctx, '700 32px')
  const nameLines = wrapText(ctx, restaurant.name, CONTENT_WIDTH - CARD_PADDING * 2)
  h += nameLines.length * 42
  if (restaurant.cuisine || restaurant.badges.length) h += 38
  h += 12 // header bottom padding
  return h
}

function measureCardContent(ctx: CanvasRenderingContext2D, restaurant: ShareSelectionData['sections'][number]): number {
  let h = 0
  for (let ci = 0; ci < restaurant.categories.length; ci++) {
    const category = restaurant.categories[ci]
    h += 24 + 38 // category top padding (24) + title line (38)
    for (let ii = 0; ii < category.items.length; ii++) {
      const item = category.items[ii]
      h += 12 // item padding top
      setFont(ctx, '30px')
      const priceWidth = item.price ? ctx.measureText(item.price).width : 0
      const titleMaxWidth = item.price ? CONTENT_WIDTH - CARD_PADDING * 2 - priceWidth - 16 : CONTENT_WIDTH - CARD_PADDING * 2
      h += wrapText(ctx, item.title, titleMaxWidth).length * 39
      if (item.description) {
        setFont(ctx, '26px')
        h += wrapText(ctx, item.description, CONTENT_WIDTH - CARD_PADDING * 2).length * 39
      }
      if (item.tags.length) h += 34
      h += 12 // item padding bottom
    }
    if (ci < restaurant.categories.length - 1) h += 24
  }
  return h
}

function drawCardHeader(
  ctx: CanvasRenderingContext2D,
  restaurant: ShareSelectionData['sections'][number],
  y: number,
  draw: boolean,
): number {
  const x = PADDING + CARD_PADDING
  const maxW = CONTENT_WIDTH - CARD_PADDING * 2
  y += 24 // header top padding

  // Restaurant name
  setFont(ctx, '700 32px')
  const nameLines = wrapText(ctx, restaurant.name, maxW)
  for (const line of nameLines) {
    if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(line, x, y + 30) }
    y += 42
  }

  // Cuisine + badges row
  if (restaurant.cuisine || restaurant.badges.length) {
    let bx = x
    if (restaurant.cuisine) {
      setFont(ctx, '600 20px')
      const tw = ctx.measureText(restaurant.cuisine).width
      if (draw) {
        fillRoundRect(ctx, bx, y, tw + 20, 30, 15, COLOR.borderLight)
        ctx.fillStyle = COLOR.secondary
        ctx.fillText(restaurant.cuisine, bx + 10, y + 22)
      }
      bx += tw + 28
    }
    for (const badge of restaurant.badges) {
      setFont(ctx, 'bold 20px')
      const tw = ctx.measureText(badge).width
      const badgeColor = BADGE_COLORS[badge] || COLOR.accent
      if (draw) {
        fillRoundRect(ctx, bx, y, tw + 20, 30, 15, badgeColor + '30')
        ctx.fillStyle = badgeColor
        ctx.fillText(badge, bx + 10, y + 22)
      }
      bx += tw + 28
    }
    y += 38
  }

  y += 12 // header bottom padding
  return y
}

function drawCardContent(
  ctx: CanvasRenderingContext2D,
  restaurant: ShareSelectionData['sections'][number],
  y: number,
  draw: boolean,
): number {
  const x = PADDING + CARD_PADDING
  const maxW = CONTENT_WIDTH - CARD_PADDING * 2

  for (let ci = 0; ci < restaurant.categories.length; ci++) {
    const category = restaurant.categories[ci]

    // Category title
    y += 24 // category top padding
    setFont(ctx, '700 26px')
    if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(category.name, x, y + 27) }
    y += 38

    for (let ii = 0; ii < category.items.length; ii++) {
      const item = category.items[ii]
      y += 12 // item padding top

      // Item title + price
      setFont(ctx, '30px')
      const priceWidth = item.price ? ctx.measureText(item.price).width : 0
      const titleMaxWidth = item.price ? maxW - priceWidth - 16 : maxW
      const titleLines = wrapText(ctx, item.title, titleMaxWidth)

      for (let li = 0; li < titleLines.length; li++) {
        if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(titleLines[li], x, y + 27) }
        if (li === 0 && item.price && draw) {
          setFont(ctx, '600 30px')
          ctx.fillStyle = COLOR.accent
          ctx.fillText(item.price, PADDING + CONTENT_WIDTH - CARD_PADDING - priceWidth, y + 27)
          setFont(ctx, '30px')
        }
        y += 39
      }

      // Description
      if (item.description) {
        setFont(ctx, '26px')
        const descLines = wrapText(ctx, item.description, maxW)
        for (const line of descLines) {
          if (draw) { ctx.fillStyle = COLOR.secondary; ctx.fillText(line, x, y + 27) }
          y += 39
        }
      }

      // Tags
      if (item.tags.length) {
        let tx = x
        setFont(ctx, '600 20px')
        for (const tag of item.tags) {
          const tagColor = TAG_COLORS[tag] || TAG_COLOR_DEFAULT
          const tagLabel = tag.toUpperCase()
          const tagWidth = ctx.measureText(tagLabel).width
          if (draw) {
            fillRoundRect(ctx, tx, y, tagWidth + 18, 30, 15, tagColor.bg)
            ctx.fillStyle = tagColor.fg
            ctx.fillText(tagLabel, tx + 9, y + 22)
          }
          tx += tagWidth + 22
        }
        y += 34
      }

      y += 12 // item padding bottom
    }

    if (ci < restaurant.categories.length - 1) y += 24
  }

  return y
}

/* ── Share data extraction ──────────────────────────────── */

export function extractRestaurantMeta(cardElement: HTMLElement): { name: string; cuisine: string; badges: string[] } | null {
  const nameElement = cardElement.querySelector('.restaurant-name')
  if (!nameElement) return null
  const name = (nameElement.childNodes[0] as Text | undefined)?.textContent?.trim() || ''
  const cuisine = cardElement.querySelector('.cuisine-tag')?.textContent?.trim() || ''
  const badges: string[] = []
  if (cardElement.querySelector('.edenred-badge')) badges.push('Edenred')
  if (cardElement.querySelector('.outdoor-badge')) badges.push('Draußen')
  if (cardElement.querySelector('.stamp-card-badge')) badges.push('Stempelkarte')
  return { name, cuisine, badges }
}

export function extractMenuItem(element: HTMLElement): { title: string; price: string; description: string; tags: string[] } {
  return {
    title:       element.querySelector('.item-title-text')?.textContent?.trim() || '',
    price:       element.querySelector('.item-price')?.textContent?.trim() || '',
    description: element.querySelector('.item-description')?.textContent?.trim() || '',
    tags:        [...element.querySelectorAll('.tag')].map(tag => tag.textContent!.trim()),
  }
}

export function groupItemsByCategory(
  itemElements: HTMLElement[],
): { name: string; items: { title: string; price: string; description: string; tags: string[] }[] }[] {
  const categoryMap = new Map<string, { title: string; price: string; description: string; tags: string[] }[]>()
  for (const element of itemElements) {
    const categoryElement = element.closest('.category')
    const categoryName = categoryElement?.querySelector('.category-title')?.textContent?.trim() || ''
    if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, [])
    categoryMap.get(categoryName)!.push(extractMenuItem(element))
  }
  return [...categoryMap.entries()].map(([name, items]) => ({ name, items }))
}

export function getShareSelectionData(getActivePanel: () => HTMLElement | null): ShareSelectionData | null {
  const activePanel = getActivePanel()
  if (!activePanel) return null

  const restaurants: ShareSelectionData['sections'] = []
  for (const card of activePanel.querySelectorAll<HTMLElement>('.restaurant-card')) {
    const selectedItems = [...card.querySelectorAll<HTMLElement>('.menu-item.share-selected:not(.hidden)')]
    const isCardSelected = card.classList.contains('share-selected')
    if (selectedItems.length === 0 && !isCardSelected) continue

    const meta = extractRestaurantMeta(card)
    if (!meta) continue

    restaurants.push({
      ...meta,
      restaurant: card.dataset.restaurant ?? '',
      categories: selectedItems.length > 0 ? groupItemsByCategory(selectedItems) : [],
    })
  }

  if (restaurants.length === 0) return null
  const day = activePanel.dataset.panel || ''
  return { day, sections: restaurants }
}

/* ── Helpers ──────────────────────────────────────────── */

function prepareLogo(svgElement: HTMLElement): void {
  const clone = svgElement.cloneNode(true) as SVGElement
  clone.setAttribute('width', '64')
  clone.setAttribute('height', '64')
  clone.querySelector('.logo-bg')?.setAttribute('fill', COLOR.accent)
  clone.querySelectorAll('.logo-fg').forEach(el => el.setAttribute('fill', COLOR.bg))
  const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' })
  const blobUrl = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => { logoImage = img; URL.revokeObjectURL(blobUrl) }
  img.src = blobUrl
}

function setFont(ctx: CanvasRenderingContext2D, style: string): void {
  ctx.font = style + ' ' + FONT_STACK
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return ['']
  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    const candidate = currentLine ? currentLine + ' ' + word : word
    if (ctx.measureText(candidate).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = candidate
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius)
  } else {
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
): void {
  roundRectPath(ctx, x, y, width, height, radius)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
): void {
  roundRectPath(ctx, x, y, width, height, radius)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.stroke()
}

function formatDayLabel(day: string): string {
  const dayIndex = [...DAYS].indexOf(day as typeof DAYS[number])
  if (dayIndex === -1) return day

  const monday = getMondayOfWeek(new Date())
  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIndex)

  return target.toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
