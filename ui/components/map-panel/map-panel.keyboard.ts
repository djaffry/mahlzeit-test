import { registerShortcut } from "../../utils/keyboard-registry"

export function registerMapKeyboard(deps: {
  toggleMapPanel: () => void
  closeMapPanel: () => void
  isMapPanelOpen: () => boolean
}): void {
  // Close map even when it's registered as an overlay
  registerShortcut({
    key: "m",
    handler: () => deps.closeMapPanel(),
    when: "always",
    guard: deps.isMapPanelOpen,
  })
  // Open map when no overlay is active
  registerShortcut({
    key: "m",
    handler: () => deps.toggleMapPanel(),
    label: "Map",
  })
}
