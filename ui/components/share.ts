/* Share — select menu items, render to canvas, copy to clipboard or share */

import "../styles/share.css"
import { DAYS, BADGES } from "../constants"
import { getMondayOfWeek } from "../utils/date"
import { isOverlayOpen } from "../utils/dom"
import { haptic } from "../utils/haptic"
import { t, getLocale } from '../i18n/i18n'
import { getIdentity } from '../rooms/user-identity'
import { avatarToImage } from '../rooms/avatars'
import type { Avatar } from '../rooms/types'

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
const LOGO_SIZE = 40
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

// Catppuccin color palettes
const COLOR_MOCHA = {
  bg:          '#1e1e2e',
  text:        '#cdd6f4',
  secondary:   '#a6adc8',
  muted:       '#6c7086',
  accent:      '#f5c2e7',
  borderLight: '#3b3c50',
}
const COLOR_LATTE = {
  bg:          '#eff1f5',
  text:        '#4c4f69',
  secondary:   '#6c6f85',
  muted:       '#9ca0b0',
  accent:      '#8839ef',
  borderLight: '#e6e9ef',
}
let COLOR = COLOR_MOCHA

const TAG_COLORS_MOCHA: Record<string, { bg: string; fg: string }> = {
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
const TAG_COLORS_LATTE: Record<string, { bg: string; fg: string }> = {
  Vegan:            { bg: 'rgba(64,160,43,0.12)',   fg: '#40a02b' },
  Vegetarisch:      { bg: 'rgba(23,146,153,0.12)',  fg: '#179299' },
  Fisch:            { bg: 'rgba(30,102,245,0.10)',  fg: '#1e66f5' },
  'Meeresfrüchte':  { bg: 'rgba(30,102,245,0.10)',  fg: '#1e66f5' },
  'Geflügel':       { bg: 'rgba(254,100,11,0.10)',  fg: '#fe640b' },
  Huhn:             { bg: 'rgba(254,100,11,0.10)',  fg: '#fe640b' },
  Pute:             { bg: 'rgba(254,100,11,0.10)',  fg: '#fe640b' },
  Ente:             { bg: 'rgba(254,100,11,0.10)',  fg: '#fe640b' },
  Fleisch:          { bg: 'rgba(210,15,57,0.10)',   fg: '#d20f39' },
  Lamm:             { bg: 'rgba(210,15,57,0.10)',   fg: '#d20f39' },
  Schweinefleisch:  { bg: 'rgba(210,15,57,0.10)',   fg: '#d20f39' },
  Rindfleisch:      { bg: 'rgba(210,15,57,0.10)',   fg: '#d20f39' },
  Glutenfrei:       { bg: 'rgba(223,142,29,0.12)',  fg: '#df8e1d' },
  Laktosefrei:      { bg: 'rgba(114,135,253,0.10)', fg: '#7287fd' },
}
let TAG_COLORS: Record<string, { bg: string; fg: string }> = TAG_COLORS_MOCHA
const TAG_COLOR_DEFAULT_MOCHA = { bg: 'rgba(245,194,231,0.18)', fg: '#f5c2e7' }
const TAG_COLOR_DEFAULT_LATTE = { bg: 'rgba(136,57,239,0.10)', fg: '#8839ef' }
let TAG_COLOR_DEFAULT = TAG_COLOR_DEFAULT_MOCHA

const TOAST_DURATION_MS = 2500
const VIBRATE_MS = 8

/* ── Module state ──────────────────────────────────────── */

let selectionBar: HTMLElement | null = null
let logoImageDark: HTMLImageElement | null = null
let logoImageLight: HTMLImageElement | null = null
let logoImage: HTMLImageElement | null = null
let headerTitle = ''
let headerSubtitle = ''
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

    // Select-all button — select all / toggle link card
    const selectAllBtn = target.closest('.select-all-btn')
    if (selectAllBtn) {
      const card = selectAllBtn.closest('.restaurant-card') as HTMLElement | null
      if (card && !card.classList.contains('map-card') && !card.classList.contains('voting-card')) {
        const allItems = card.querySelectorAll<HTMLElement>('.menu-item:not(.hidden)')
        if (allItems.length === 0) {
          // Link card — toggle card-level selection
          const on = card.classList.toggle('share-all')
          card.classList.toggle('share-any', on)
          if (on) card.classList.remove('dice-pick')
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

export async function renderShareImage(data: ShareSelectionData): Promise<HTMLCanvasElement> {
  applyTheme()

  const measureCtx = document.createElement('canvas').getContext('2d')!
  const { height } = layoutCanvas(measureCtx, data, false)

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  ctx.fillStyle = COLOR.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, height)
  const { avatarDraw } = layoutCanvas(ctx, data, true)

  if (avatarDraw) {
    const { avatar, x, y, size } = avatarDraw
    const iconSize = Math.round(size * 0.6)
    try {
      const img = await avatarToImage(avatar, iconSize * 2)
      ctx.drawImage(img, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize)
    } catch { /* icon render failed, circle is still visible */ }
  }

  return canvas
}

function applyTheme(): void {
  const isLatte = document.documentElement.dataset.theme === 'latte'
  COLOR = isLatte ? COLOR_LATTE : COLOR_MOCHA
  TAG_COLORS = isLatte ? TAG_COLORS_LATTE : TAG_COLORS_MOCHA
  TAG_COLOR_DEFAULT = isLatte ? TAG_COLOR_DEFAULT_LATTE : TAG_COLOR_DEFAULT_MOCHA
  logoImage = isLatte ? logoImageLight : logoImageDark
}

/* ── Selection & sharing ──────────────────────────────── */

async function shareSelectionAsPicture(): Promise<void> {
  const data = _getSelectionData?.()
  if (!data) return
  const canvas = await renderShareImage(data)
  const filename = data.sections.length === 1 ? data.sections[0].restaurant : t('share.filename')
  await exportImage(canvas, filename)
  clearSelection()
}

async function shareSelectionAsText(): Promise<void> {
  const data = _getSelectionData?.()
  if (!data) return
  const text = formatAsText(data)
  try {
    await navigator.clipboard.writeText(text)
    showToast(t('share.copied'), null, text)
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
    showToast(t('share.copyFailed'))
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

  const identity = getIdentity()
  if (identity) {
    lines.push('')
    lines.push('- ' + identity.avatar.label)
  }

  return lines.join('\n')
}

export function clearSelection(): void {
  document.querySelectorAll('.share-selected, .share-any, .share-all').forEach(el => el.classList.remove('share-selected', 'share-any', 'share-all'))
  updateSelectionBar()
  if (onClearCallback) onClearCallback()
}

// Sync card-level classes when items are selected/deselected
function syncCardSelectedState(card: HTMLElement): void {
  const allItems = card.querySelectorAll('.menu-item:not(.hidden)')
  let selected = 0
  for (const el of allItems) {
    if (el.classList.contains('share-selected')) selected++
  }
  card.classList.toggle('share-any', selected > 0)
  card.classList.toggle('share-all', allItems.length > 0 && selected === allItems.length)
}

/* ── Floating selection bar ───────────────────────────── */

function createSelectionBar(): void {
  const bar = document.createElement('div')
  bar.className = 'share-bar'
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-live', 'polite')
  bar.innerHTML = `
    <span class="share-bar-label">${t('share.label')}</span>
    <span class="share-bar-count"></span>
    <div class="share-bar-actions">
      <button class="share-bar-picture" aria-label="${t('share.asImage')}" title="${t('share.asImage')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <kbd class="kbd">P</kbd>
      </button>
      <button class="share-bar-text" aria-label="${t('share.asText')}" title="${t('share.asText')}">Txt<kbd class="kbd">T</kbd></button>
      <button class="share-bar-clear" aria-label="${t('share.clearSelection')}" title="${t('share.clearSelection')}">
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
  countLabel.textContent = t('share.selectedCount', { count: String(totalSelected) })
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
      showToast(t('share.clipboardCopied'), canvas)
      return
    } catch { /* fall through */ }

    // Try with Promise (Safari — preserves user activation)
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png')),
      })])
      showToast(t('share.clipboardCopied'), canvas)
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
  showToast(t('share.imageDownloaded'), canvas)
}

export function showToast(message: string, canvas?: HTMLCanvasElement | null, text?: string): void {
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

type AvatarDraw = { avatar: Avatar; x: number; y: number; size: number }

function layoutCanvas(ctx: CanvasRenderingContext2D, data: ShareSelectionData, draw: boolean): { height: number; avatarDraw: AvatarDraw | null } {
  let y = PADDING
  let avatarDraw: AvatarDraw | null = null
  const x = PADDING
  const maxW = CONTENT_WIDTH
  const rightX = CANVAS_WIDTH - PADDING

  // ── Header: logo + title + subtitle ──
  const identX = x + LOGO_SIZE + 14
  if (draw && logoImage) ctx.drawImage(logoImage, x, y + 4, LOGO_SIZE, LOGO_SIZE)

  setFont(ctx, '700 22px')
  if (draw) { ctx.fillStyle = COLOR.accent; ctx.fillText(headerTitle, identX, y + 20) }
  const titleWidth = ctx.measureText(headerTitle).width

  setFont(ctx, '15px')
  if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(headerSubtitle, identX, y + 38) }

  // Right column: avatar badge (row 1), date (row 2)
  const identity = getIdentity()
  if (identity) {
    const avatarSize = 24
    setFont(ctx, '600 14px')
    const maxLabelW = rightX - (identX + titleWidth + 24) - avatarSize - 6
    const label = ellipsize(ctx, identity.avatar.label, Math.max(maxLabelW, 60))
    const labelWidth = ctx.measureText(label).width
    const groupW = avatarSize + 6 + labelWidth
    const groupX = rightX - groupW
    const avatarCy = y + 10

    if (draw) {
      ctx.beginPath()
      ctx.arc(groupX + avatarSize / 2, avatarCy, avatarSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = identity.avatar.color
      ctx.fill()
      avatarDraw = { avatar: identity.avatar, x: groupX + avatarSize / 2, y: avatarCy, size: avatarSize }
      ctx.fillStyle = COLOR.text
      ctx.fillText(label, groupX + avatarSize + 6, avatarCy + 5)
    }
  }

  if (data.day) {
    setFont(ctx, '14px')
    const dayLabel = formatDayLabel(data.day)
    if (draw) {
      ctx.fillStyle = COLOR.muted
      ctx.textAlign = 'right'
      ctx.fillText(dayLabel, rightX, y + 42)
      ctx.textAlign = 'left'
    }
  }

  y += 48

  // ── Restaurant sections ──
  const restaurants = data.sections
  for (let ri = 0; ri < restaurants.length; ri++) {
    // Separator line between header/restaurants and between restaurants
    y += 20
    if (draw) { ctx.fillStyle = COLOR.borderLight; ctx.fillRect(x, y, maxW, 1) }
    y += 20

    const restaurant = restaurants[ri]

    // Restaurant name
    setFont(ctx, '700 24px')
    const nameLines = wrapText(ctx, restaurant.name, maxW)
    for (const line of nameLines) {
      if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(line, x, y + 22) }
      y += 32
    }

    y += 4

    // Items (categories flattened)
    for (let ci = 0; ci < restaurant.categories.length; ci++) {
      const category = restaurant.categories[ci]

      for (const item of category.items) {
        y += 8

        setFont(ctx, '20px')
        const priceWidth = item.price ? ctx.measureText(item.price).width : 0
        const titleMaxW = item.price ? maxW - priceWidth - 14 : maxW
        const titleLines = wrapText(ctx, item.title, titleMaxW)

        for (let li = 0; li < titleLines.length; li++) {
          if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(titleLines[li], x, y + 18) }
          if (li === 0 && item.price && draw) {
            setFont(ctx, '600 20px')
            ctx.fillStyle = COLOR.accent
            ctx.fillText(item.price, rightX - priceWidth, y + 18)
            setFont(ctx, '20px')
          }
          y += 28
        }

        if (item.description) {
          y += 2
          setFont(ctx, '15px')
          for (const line of wrapText(ctx, item.description, maxW)) {
            if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(line, x, y + 13) }
            y += 21
          }
        }

        if (item.tags.length) {
          y += 4
          let tx = x
          setFont(ctx, '600 12px')
          for (const tag of item.tags) {
            const tagColor = TAG_COLORS[tag] || TAG_COLOR_DEFAULT
            const tagLabel = t('tag.' + tag).toUpperCase()
            const tagWidth = ctx.measureText(tagLabel).width
            if (draw) {
              fillRoundRect(ctx, tx, y, tagWidth + 12, 20, 10, tagColor.bg)
              ctx.fillStyle = tagColor.fg
              ctx.fillText(tagLabel, tx + 6, y + 14)
            }
            tx += tagWidth + 10
          }
          y += 20
        }
      }
    }
  }

  return { height: y + PADDING, avatarDraw }
}

/* ── Share data extraction ──────────────────────────────── */

export function extractRestaurantMeta(cardElement: HTMLElement): { name: string; cuisine: string; badges: string[] } | null {
  const nameElement = cardElement.querySelector('.restaurant-name')
  if (!nameElement) return null
  const name = nameElement.textContent?.trim() || ''
  const cuisine = cardElement.querySelector('.cuisine-tag')?.textContent?.trim() || ''
  const badges = BADGES.filter(b => cardElement.querySelector(`.${b.css}`)).map(b => b.i18n)
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
    const isCardSelected = card.classList.contains('share-all')
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
  createLogoImage(svgElement, COLOR_MOCHA, img => { logoImageDark = img })
  createLogoImage(svgElement, COLOR_LATTE, img => { logoImageLight = img })
}

function createLogoImage(
  svgElement: HTMLElement,
  colors: { accent: string; bg: string },
  onReady: (img: HTMLImageElement) => void,
): void {
  const clone = svgElement.cloneNode(true) as SVGElement
  clone.setAttribute('width', '64')
  clone.setAttribute('height', '64')
  clone.querySelector('.logo-bg')?.setAttribute('fill', colors.accent)
  clone.querySelectorAll('.logo-fg').forEach(el => el.setAttribute('fill', colors.bg))
  const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' })
  const blobUrl = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => { onReady(img); URL.revokeObjectURL(blobUrl) }
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

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  for (let i = text.length - 1; i > 0; i--) {
    const truncated = text.slice(0, i) + '…'
    if (ctx.measureText(truncated).width <= maxWidth) return truncated
  }
  return '…'
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

function formatDayLabel(day: string): string {
  const dayIndex = [...DAYS].indexOf(day as typeof DAYS[number])
  if (dayIndex === -1) return day

  const monday = getMondayOfWeek(new Date())
  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIndex)

  return target.toLocaleDateString(getLocale(), {
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
