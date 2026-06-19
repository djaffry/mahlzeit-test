
const STORAGE_KEY = "peckish:toc-pins-only"

export const VIEW_MODE_CHANGE_EVENT = "peckish:view-mode-change"

const _state = {
  pinsOnly: false,
}

export function loadViewMode(): void {
  try {
    _state.pinsOnly = localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    _state.pinsOnly = false
  }
}

export function isPinsOnly(): boolean {
  return _state.pinsOnly
}

export function togglePinsOnly(): void {
  _state.pinsOnly = !_state.pinsOnly
  try {
    localStorage.setItem(STORAGE_KEY, _state.pinsOnly ? "1" : "0")
  } catch { /* ignore */ }
  document.dispatchEvent(new CustomEvent(VIEW_MODE_CHANGE_EVENT))
}

