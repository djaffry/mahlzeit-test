/* ── Shared canvas utilities ────────────────────────────── */

const REVOKE_DELAY_MS = 1000

export const FONT_STACK = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

// Monochrome color palettes
export const COLOR_MOCHA = {
  bg:          '#111',
  text:        '#e8e8e8',
  muted:       '#8b8b8b',
  accent:      '#fff',
  borderLight: '#2a2a2a',
}
export const COLOR_LATTE = {
  bg:          '#fff',
  text:        '#1a1a1a',
  muted:       '#6b6b6b',
  accent:      '#000',
  borderLight: '#e0e0e0',
}

export type ExportResult = "clipboard" | "share" | "download"

/**
 * Export a canvas image via clipboard, Web Share API, or download fallback.
 * Returns which method succeeded so callers can show appropriate feedback.
 */
export async function exportImage(canvas: HTMLCanvasElement, name: string, deepLink?: string): Promise<ExportResult> {
  const filename = (name || 'menu') + '.png'

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const blob = await canvasToBlob(canvas)
      const items: Record<string, Blob> = { 'image/png': blob }
      if (deepLink) items['text/plain'] = new Blob([deepLink], { type: 'text/plain' })
      await navigator.clipboard.write([new ClipboardItem(items)])
      return "clipboard"
    } catch { /* fall through */ }

    try {
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), 'image/png')),
      })])
      if (deepLink) await navigator.clipboard.writeText(deepLink).catch(() => {})
      return "clipboard"
    } catch { /* fall through */ }
  }

  const blob = await canvasToBlob(canvas)
  const file = new File([blob], filename, { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        text: deepLink ?? undefined,
      })
      return "share"
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return "share"
  }

  downloadBlob(blob, filename)
  return "download"
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), 'image/png'))
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
