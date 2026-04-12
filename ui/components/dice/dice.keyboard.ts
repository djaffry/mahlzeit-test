import { registerShortcut } from "../../utils/keyboard-registry"

export function registerDiceKeyboard(deps: {
  diceRoll: () => void
  isDiceAvailable: () => boolean
}): void {
  registerShortcut({
    key: "d",
    handler: () => deps.diceRoll(),
    guard: deps.isDiceAvailable,
    label: "Random pick",
  })
}
