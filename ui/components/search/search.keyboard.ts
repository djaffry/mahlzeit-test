import { registerShortcut } from "../../utils/keyboard-registry"

export function registerSearchKeyboard(deps: {
  openSearch: () => void
}): void {
  registerShortcut({
    key: "/",
    handler: () => deps.openSearch(),
    preventDefault: true,
    label: "Search",
  })
}
