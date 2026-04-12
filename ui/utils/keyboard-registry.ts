import { shouldIgnoreKeydown } from "./keyboard"
import { isOverlayOpen } from "./overlay"

type KeyMatcher = string | ((key: string, event: KeyboardEvent) => boolean)

interface Shortcut {
  key: KeyMatcher
  handler: (e: KeyboardEvent) => void
  /** "no-overlay" (default): blocked when an overlay is open.
   *  "overlay": only fires when an overlay IS open.
   *  "always": fires regardless. */
  when?: "always" | "overlay" | "no-overlay"
  guard?: () => boolean
  preventDefault?: boolean
  /** Human-readable label shown in the shortcuts modal. */
  label?: string
}

const _shortcuts: Shortcut[] = []
let _listening = false

function keyMatches(matcher: KeyMatcher, e: KeyboardEvent): boolean {
  if (typeof matcher === "function") return matcher(e.key, e)
  return matcher.toLowerCase() === e.key.toLowerCase()
}

function ensureListener(): void {
  if (_listening) return
  _listening = true
  document.addEventListener("keydown", (e) => {
    if (shouldIgnoreKeydown(e)) return
    const inOverlay = isOverlayOpen()

    for (const s of _shortcuts) {
      const when = s.when ?? "no-overlay"
      if (when === "overlay" && !inOverlay) continue
      if (when === "no-overlay" && inOverlay) continue

      if (!keyMatches(s.key, e)) continue
      if (s.guard && !s.guard()) continue
      if (s.preventDefault) e.preventDefault()
      s.handler(e)
      return
    }
  })
}

export function registerShortcut(opts: Shortcut): () => void {
  ensureListener()
  _shortcuts.push(opts)
  return () => {
    const idx = _shortcuts.indexOf(opts)
    if (idx >= 0) _shortcuts.splice(idx, 1)
  }
}

/** Clear all registered shortcuts. Only for use in test teardown. */
export function _resetForTesting(): void {
  _shortcuts.length = 0
}
