import { registerShortcut } from "../utils/keyboard-registry"
import { haptic } from "../utils/haptic"

export interface KeyboardDeps {
  expandDay: (index: number) => void
  collapseAllExceptToday: () => void
  openFilterSelector: () => void
  openVotingRoomsPanel: () => void
  cycleTheme: () => void
  showShortcutsModal: () => void
  switchLanguage: () => void
  closeSearch: () => void
  closeMenu: () => void
  closeAllOverlays: () => void
}

export function setupKeyboard(deps: KeyboardDeps): void {
  // Overlay-mode: Escape closes everything
  registerShortcut({
    key: "Escape",
    when: "overlay",
    handler: () => {
      deps.closeSearch()
      deps.closeMenu()
      deps.closeAllOverlays()
    },
  })

  // Language toggle works everywhere
  registerShortcut({
    key: "l",
    when: "always",
    handler: () => deps.switchLanguage(),
    label: "Language",
  })

  // Day numbers 1-5
  registerShortcut({
    key: (k) => k >= "1" && k <= "5",
    handler: (e) => {
      haptic()
      deps.expandDay(Number(e.key) - 1)
    },
  })

  registerShortcut({ key: "f", handler: () => deps.openFilterSelector(), label: "Filters" })
  registerShortcut({ key: "v", handler: () => deps.openVotingRoomsPanel(), label: "Voting rooms" })
  registerShortcut({ key: "t", handler: () => deps.cycleTheme(), label: "Theme" })

  // Escape without overlay: collapse to today
  // (lower priority than share's Escape - share registers first)
  registerShortcut({
    key: "Escape",
    handler: () => deps.collapseAllExceptToday(),
  })

  registerShortcut({ key: "?", handler: () => deps.showShortcutsModal() })
}
