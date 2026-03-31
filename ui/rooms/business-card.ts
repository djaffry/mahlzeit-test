import { t } from "../i18n/i18n"
import { showToast } from "../components/share"
import { avatarToImage } from "./avatars"
import type { Avatar } from "./types"

const CARD_HEIGHT = 80
const PADDING_LEFT = 80
const PADDING_RIGHT = 20
const DPR = 2
const PREVIEW_SCALE = 0.8
const FONT = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

let _canvas: HTMLCanvasElement | null = null

export async function copyBusinessCard(avatar: Avatar): Promise<void> {
  if (!_canvas) _canvas = document.createElement("canvas")
  const ctx = _canvas.getContext("2d")
  if (!ctx) return

  const bg = cssVar("--bg")
  const text = cssVar("--text")
  const accent = cssVar("--accent")

  const label = t("voting.businessCard", { avatar: avatar.label })
  const nameStart = label.indexOf(avatar.label)
  const prefix = nameStart >= 0 ? label.slice(0, nameStart) : label
  const name = nameStart >= 0 ? avatar.label : ""
  const suffix = nameStart >= 0 ? label.slice(nameStart + avatar.label.length) : ""

  ctx.font = FONT
  const totalWidth = ctx.measureText(label).width
  const cardWidth = Math.ceil(PADDING_LEFT + totalWidth + PADDING_RIGHT)

  _canvas.width = cardWidth * DPR
  _canvas.height = CARD_HEIGHT * DPR
  ctx.scale(DPR, DPR)

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cardWidth, CARD_HEIGHT)

  ctx.fillStyle = avatar.color
  ctx.beginPath()
  ctx.arc(44, CARD_HEIGHT / 2, 24, 0, Math.PI * 2)
  ctx.fill()

  try {
    const img = await avatarToImage(avatar, 28 * DPR)
    ctx.drawImage(img, 44 - 14, CARD_HEIGHT / 2 - 14, 28, 28)
  } catch { /* icon render failed, circle is still visible */ }

  ctx.font = FONT
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  let x = PADDING_LEFT
  ctx.fillStyle = text
  ctx.fillText(prefix, x, CARD_HEIGHT / 2)
  x += ctx.measureText(prefix).width
  ctx.fillStyle = accent
  ctx.fillText(name, x, CARD_HEIGHT / 2)
  x += ctx.measureText(name).width
  ctx.fillStyle = text
  ctx.fillText(suffix, x, CARD_HEIGHT / 2)

  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      _canvas!.toBlob(resolve, "image/png")
    )
    if (!blob) return
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ])
  } catch {
    await navigator.clipboard.writeText(label)
  }

  const pw = Math.round(cardWidth * PREVIEW_SCALE * DPR)
  const ph = Math.round(CARD_HEIGHT * PREVIEW_SCALE * DPR)
  const preview = document.createElement("canvas")
  preview.width = pw
  preview.height = ph
  preview.getContext("2d")!.drawImage(_canvas, 0, 0, pw, ph)
  showToast(t("voting.copied"), preview)
}
