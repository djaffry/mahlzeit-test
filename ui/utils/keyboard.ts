export function shouldIgnoreKeydown(e: KeyboardEvent): boolean {
  if (e.key === "Escape") return false
  if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return true
  if (e.metaKey || e.ctrlKey || e.altKey) return true
  return false
}
