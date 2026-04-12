const _savingKeys = new Set<string>()
let _savedTimer: ReturnType<typeof setTimeout> | null = null
let _fallbackTimer: ReturnType<typeof setTimeout> | null = null

const SAVING_FALLBACK_MS = 5000
const SAVED_DISPLAY_MS = 1500

function voteKey(id: string, dayIndex: number): string {
  return `${dayIndex}:${id}`
}

function parseVoteKey(key: string): { id: string; dayIndex: number } {
  const sep = key.indexOf(":")
  return { dayIndex: Number(key.slice(0, sep)), id: key.slice(sep + 1) }
}

function getBtn(id: string, dayIndex: number): Element | null {
  return document.querySelector(`.day-section[data-day-index="${dayIndex}"] .vote-btn[data-vote-id="${CSS.escape(id)}"]`)
}

export function hasPending(): boolean {
  return _savingKeys.size > 0
}

export function markSaving(restaurantId: string, dayIndex: number): void {
  _savingKeys.add(voteKey(restaurantId, dayIndex))
  if (_savedTimer) { clearTimeout(_savedTimer); _savedTimer = null }
  if (!_fallbackTimer) {
    _fallbackTimer = setTimeout(() => clearAll(), SAVING_FALLBACK_MS)
  }
  const btn = getBtn(restaurantId, dayIndex)
  if (btn) { btn.classList.remove("vote-saved"); btn.classList.add("vote-saving") }
}

export function markSaved(): void {
  if (_savedTimer) { clearTimeout(_savedTimer); _savedTimer = null }
  const btns: Element[] = []
  for (const key of _savingKeys) {
    const { id, dayIndex } = parseVoteKey(key)
    const btn = getBtn(id, dayIndex)
    if (btn) btns.push(btn)
  }
  clearAll()
  for (const btn of btns) btn.classList.add("vote-saved")
  _savedTimer = setTimeout(() => {
    for (const btn of btns) btn.classList.remove("vote-saved")
    _savedTimer = null
  }, SAVED_DISPLAY_MS)
}

export function clearAll(): void {
  _savingKeys.clear()
  if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null }
  document.querySelectorAll(".vote-btn.vote-saving").forEach((el) => el.classList.remove("vote-saving"))
}
