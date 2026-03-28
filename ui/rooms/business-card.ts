import { t } from "../i18n/i18n"
import { showToast } from "../components/share"
import type { Avatar } from "./types"

const CARD_HEIGHT = 80
const PADDING_LEFT = 80
const PADDING_RIGHT = 20
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

  _canvas.width = cardWidth
  _canvas.height = CARD_HEIGHT

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cardWidth, CARD_HEIGHT)

  ctx.fillStyle = avatar.color
  ctx.beginPath()
  ctx.arc(44, CARD_HEIGHT / 2, 24, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = "28px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(avatar.emoji, 44, CARD_HEIGHT / 2 + 1)

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

  showToast(t("voting.copied"), _canvas)
}
