import { FONT_STACK, COLOR_MOCHA, COLOR_LATTE } from "../../utils/canvas"
import { svgToImage } from "../../utils/dom"
import { getIdentity } from "../../voting/user-identity"
import { avatarToImage } from "../../voting/avatars"
import { getEffectiveTheme } from "../theme-toggle/theme-toggle"
import type { Avatar } from "../../voting/types"
import type { ShareSelectionData, ShareSection, ShareDayGroup } from "./share-types"
import { formatDayLabel, formatBadges } from "./share-format"

/* ── Constants ─────────────────────────────────────────── */

const CANVAS_WIDTH = 720
const PADDING = 36
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2
const LOGO_SIZE = 40

let COLOR = COLOR_MOCHA

/* ── Module state ──────────────────────────────────────── */

let logoImageDark: HTMLImageElement | null = null
let logoImageLight: HTMLImageElement | null = null
let logoImage: HTMLImageElement | null = null
let headerTitle = ''
let headerSubtitle = ''

/* ── Public API ───────────────────────────────────────── */

export function initLogos(svgElement: HTMLElement): void {
  createLogoImage(svgElement, COLOR_MOCHA, img => { logoImageDark = img })
  createLogoImage(svgElement, COLOR_LATTE, img => { logoImageLight = img })
}

export function setTitles(title: string, subtitle: string): void {
  headerTitle = title
  headerSubtitle = subtitle
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

/* ── Internal ─────────────────────────────────────────── */

function applyTheme(): void {
  const isLatte = getEffectiveTheme() === 'light'
  COLOR = isLatte ? COLOR_LATTE : COLOR_MOCHA
  logoImage = isLatte ? logoImageLight : logoImageDark
}

type AvatarDraw = { avatar: Avatar; x: number; y: number; size: number }

function drawHeader(ctx: CanvasRenderingContext2D, draw: boolean, y: number): { y: number; avatarDraw: AvatarDraw | null } {
  const x = PADDING
  const rightX = CANVAS_WIDTH - PADDING
  let avatarDraw: AvatarDraw | null = null

  const identX = x + LOGO_SIZE + 14
  if (draw && logoImage) ctx.drawImage(logoImage, x, y + 2, LOGO_SIZE, LOGO_SIZE)

  setFont(ctx, '700 24px')
  if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(headerTitle, identX, y + 18) }

  setFont(ctx, '400 13px')
  if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(headerSubtitle, identX, y + 36) }

  const identity = getIdentity()
  if (identity) {
    const avatarSize = 28
    setFont(ctx, '500 11px')
    const label = ellipsize(ctx, identity.avatar.label, 100)
    const labelWidth = ctx.measureText(label).width
    const groupW = Math.max(avatarSize, labelWidth)
    const avatarCx = rightX - groupW / 2
    const avatarCy = y + 12

    if (draw) {
      ctx.beginPath()
      ctx.arc(avatarCx, avatarCy, avatarSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = identity.avatar.color
      ctx.fill()
      avatarDraw = { avatar: identity.avatar, x: avatarCx, y: avatarCy, size: avatarSize }

      ctx.fillStyle = COLOR.muted
      ctx.fillText(label, avatarCx - labelWidth / 2, avatarCy + avatarSize / 2 + 13)
    }
  }

  return { y: y + 52, avatarDraw }
}

function drawMenuItem(
  ctx: CanvasRenderingContext2D,
  item: ShareSelectionData['days'][number]['sections'][number]['categories'][number]['items'][number],
  draw: boolean,
  y: number,
): { y: number } {
  const x = PADDING
  const maxW = CONTENT_WIDTH
  const rightX = CANVAS_WIDTH - PADDING

  y += 10

  setFont(ctx, '500 17px')
  const priceWidth = item.price ? ctx.measureText(item.price).width : 0
  const titleMaxW = item.price ? maxW - priceWidth - 16 : maxW

  const fullTitle = item.description ? `${item.title} - ${item.description}` : item.title
  const titleLines = wrapText(ctx, fullTitle, titleMaxW)

  for (let li = 0; li < titleLines.length; li++) {
    if (li === 0) {
      if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(titleLines[li], x, y + 16) }
      if (item.price && draw) {
        setFont(ctx, '600 17px')
        ctx.fillStyle = COLOR.text
        ctx.fillText(item.price, rightX - priceWidth, y + 16)
        setFont(ctx, '500 17px')
      }
    } else {
      if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(titleLines[li], x, y + 16) }
    }
    y += 24
  }

  if (item.tags.length) {
    y += 2
    let tx = x
    setFont(ctx, '600 10px')
    if (draw) ctx.lineWidth = 1
    for (const tag of item.tags) {
      const tagLabel = tag.label.toUpperCase()
      const tagWidth = ctx.measureText(tagLabel).width
      const pillW = tagWidth + 10
      const pillH = 16
      if (draw) {
        roundRectPath(ctx, tx, y, pillW, pillH, 8)
        ctx.strokeStyle = tag.color
        ctx.stroke()
        ctx.fillStyle = tag.color
        ctx.fillText(tagLabel, tx + 5, y + 11.5)
      }
      tx += pillW + 5
    }
    y += 18
  }

  return { y }
}

function drawRestaurantBlock(
  ctx: CanvasRenderingContext2D,
  restaurant: ShareSection,
  draw: boolean,
  y: number,
  isLast: boolean,
): { y: number } {
  const x = PADDING
  const maxW = CONTENT_WIDTH

  y += 12

  setFont(ctx, '700 22px')
  const nameLines = wrapText(ctx, restaurant.name, maxW)
  for (const line of nameLines) {
    if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(line, x, y + 20) }
    y += 30
  }

  const metaParts: string[] = []
  if (restaurant.cuisine) metaParts.push(restaurant.cuisine)
  if (restaurant.badges.length) metaParts.push(formatBadges(restaurant.badges))
  if (metaParts.length) {
    setFont(ctx, '400 13px')
    if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(metaParts.join(' · '), x, y + 4) }
    y += 20
  }

  y += 6

  for (const category of restaurant.categories) {
    if (category.name) {
      y += 4
      setFont(ctx, '600 11px')
      if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(category.name.toUpperCase(), x, y + 10) }
      y += 18
    }

    for (const item of category.items) {
      ;({ y } = drawMenuItem(ctx, item, draw, y))
    }
  }

  if (!isLast) {
    y += 14
    if (draw) { ctx.fillStyle = COLOR.borderLight; ctx.fillRect(x + maxW * 0.1, y, maxW * 0.8, 0.5) }
    y += 6
  }

  return { y }
}

function drawDayGroup(
  ctx: CanvasRenderingContext2D,
  dayGroup: ShareDayGroup,
  draw: boolean,
  y: number,
): { y: number } {
  const x = PADDING
  const maxW = CONTENT_WIDTH

  if (dayGroup.day) {
    y += 8
    if (draw) { ctx.fillStyle = COLOR.accent; ctx.fillRect(x, y, maxW, 1.5) }
    y += 20
    setFont(ctx, '600 14px')
    if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(formatDayLabel(dayGroup.day), x, y + 12) }
    y += 24
  }

  for (let ri = 0; ri < dayGroup.sections.length; ri++) {
    const isLast = ri === dayGroup.sections.length - 1
    ;({ y } = drawRestaurantBlock(ctx, dayGroup.sections[ri], draw, y, isLast))
  }

  return { y }
}

function layoutCanvas(ctx: CanvasRenderingContext2D, data: ShareSelectionData, draw: boolean): { height: number; avatarDraw: AvatarDraw | null } {
  let y = PADDING

  const header = drawHeader(ctx, draw, y)
  y = header.y

  for (const dayGroup of data.days) {
    ;({ y } = drawDayGroup(ctx, dayGroup, draw, y))
  }

  return { height: y + PADDING, avatarDraw: header.avatarDraw }
}

function createLogoImage(
  svgElement: HTMLElement,
  colors: { accent: string; bg: string },
  onReady: (img: HTMLImageElement) => void,
): void {
  const clone = svgElement.cloneNode(true) as SVGElement
  clone.setAttribute('width', '64')
  clone.setAttribute('height', '64')

  const hasLogoParts = clone.querySelector('.logo-bg') || clone.querySelector('.logo-fg')
  if (hasLogoParts) {
    clone.querySelector('.logo-bg')?.setAttribute('fill', colors.accent)
    clone.querySelectorAll('.logo-fg').forEach(el => el.setAttribute('fill', colors.bg))
  } else {
    // Stroke-based icon (e.g. lucide) - set stroke color to accent
    clone.setAttribute('stroke', colors.accent)
    clone.setAttribute('color', colors.accent)
  }

  svgToImage(clone.outerHTML).then(onReady).catch(() => {})
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
