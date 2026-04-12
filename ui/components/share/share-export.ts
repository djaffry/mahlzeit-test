import { DAYS } from "../../constants"
import { t } from "../../i18n/i18n"
import { exportImage as coreExportImage } from "../../utils/canvas"
import { getIdentity } from "../../voting/user-identity"
import { getActiveRoomPayload } from "../../voting/init"
import { formatDayLabel } from "./share-format"
import type { ShareSelectionData, ShareSection } from "./share-types"

/* ── Constants ─────────────────────────────────────────── */

const TOAST_DURATION_MS = 2500

/* ── Helpers ──────────────────────────────────────────── */

export function allSections(data: ShareSelectionData): ShareSection[] {
  return data.days.flatMap(d => d.sections)
}

/* ── Public API ─────────────────────────────────────────── */

export function formatAsText(data: ShareSelectionData): string {
  const lines: string[] = []

  for (const dayGroup of data.days) {
    if (lines.length) lines.push('')
    if (dayGroup.day) lines.push(formatDayLabel(dayGroup.day))

    for (const restaurant of dayGroup.sections) {
      if (lines.length) lines.push('')
      const meta = [restaurant.cuisine, ...restaurant.badges.map(b => t(b))].filter(Boolean)
      lines.push(meta.length ? `${restaurant.name} (${meta.join(', ')})` : restaurant.name)

      for (const category of restaurant.categories) {
        for (const item of category.items) {
          const price = item.price ? `  ${item.price}` : ''
          const desc = item.description ? ` - ${item.description.replace(/\n/g, ' ')}` : ''
          lines.push(`- ${item.title.replace(/\n/g, ' ')}${desc}${price}`)
        }
      }
    }
  }

  lines.push('')
  const sections = allSections(data)
  const restaurantIds = sections.map(s => s.restaurant)
  lines.push(buildDeepLink(restaurantIds, data.days[0]?.day ?? ''))

  const identity = getIdentity()
  if (identity) {
    lines.push('')
    lines.push('- ' + identity.avatar.label)
  }

  return lines.join('\n')
}

export async function exportImage(canvas: HTMLCanvasElement, name: string, deepLink?: string): Promise<void> {
  const result = await coreExportImage(canvas, name, deepLink)
  if (result === "clipboard") showToast(t('share.clipboardCopied'), canvas)
  else if (result === "download") showToast(t('share.imageDownloaded'), canvas)
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
  void toast.offsetHeight
  if (canvas) backdrop.classList.add('flash')
  backdrop.classList.add('visible')
  toast.classList.add('visible')
  setTimeout(dismiss, TOAST_DURATION_MS)
}

export function buildDeepLink(restaurantIds: string[], dayName: string): string {
  const base = window.location.origin + window.location.pathname
  const params = new URLSearchParams()
  if (restaurantIds.length === 1) {
    params.set('r', restaurantIds[0])
  }
  if (dayName) {
    const idx = DAYS.indexOf(dayName as typeof DAYS[number])
    if (idx >= 0) params.set('d', String(idx))
  }
  try {
    const roomPayload = getActiveRoomPayload()
    if (roomPayload) params.set('room', roomPayload)
  } catch { /* no active room */ }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
