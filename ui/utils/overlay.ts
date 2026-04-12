const _openOverlays = new Set<string>()

export function registerOverlay(id: string): void {
  _openOverlays.add(id)
}

export function unregisterOverlay(id: string): void {
  _openOverlays.delete(id)
}

export function isOverlayOpen(): boolean {
  return _openOverlays.size > 0
}
