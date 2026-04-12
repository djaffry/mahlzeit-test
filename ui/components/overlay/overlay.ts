import "./overlay.css"
import { registerOverlay, unregisterOverlay } from "../../utils/dom"
import { LANG_CHANGE_EVENT } from "../../constants"

let _nextOverlayId = 0
const _activeCloses: (() => void)[] = []

export function closeAllOverlays(): void {
  for (const close of [..._activeCloses].reverse()) close()
}

export function openOverlay(opts?: {
  minWidth?: string
  onClose?: () => void
  onLangChange?: () => void
  dismissable?: boolean
}): { panel: HTMLElement; close: () => void } {
  const overlayId = `overlay-${++_nextOverlayId}`
  const overlay = document.createElement("div")
  overlay.className = "overlay-centered visible"

  const panel = document.createElement("div")
  panel.className = "overlay-panel"
  if (opts?.minWidth) panel.style.minWidth = opts.minWidth
  overlay.appendChild(panel)

  if (opts?.onLangChange) {
    document.addEventListener(LANG_CHANGE_EVENT, opts.onLangChange)
  }

  registerOverlay(overlayId)
  _activeCloses.push(close)

  // Trap focus by marking siblings inert
  const inertSiblings: Element[] = []
  for (const child of document.body.children) {
    if (child === overlay || (child as HTMLElement).inert) continue
    ;(child as HTMLElement).inert = true
    inertSiblings.push(child)
  }

  function close(): void {
    const idx = _activeCloses.indexOf(close)
    if (idx >= 0) _activeCloses.splice(idx, 1)
    for (const el of inertSiblings) (el as HTMLElement).inert = false
    if (opts?.onLangChange) {
      document.removeEventListener(LANG_CHANGE_EVENT, opts.onLangChange)
    }
    unregisterOverlay(overlayId)
    overlay.remove()
    opts?.onClose?.()
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && opts?.dismissable !== false) close()
  })

  document.body.appendChild(overlay)

  return { panel, close }
}
