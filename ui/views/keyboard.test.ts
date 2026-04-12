import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { _resetForTesting } from "../utils/keyboard-registry"

const mockIsOverlayOpen = vi.fn()

vi.mock("../utils/overlay", () => ({
  isOverlayOpen: () => mockIsOverlayOpen(),
}))
vi.mock("../utils/haptic", () => ({ haptic: vi.fn() }))

import { setupKeyboard } from "./keyboard"

const mockExpandDay = vi.fn()
const mockOpenFilterSelector = vi.fn()
const mockCycleTheme = vi.fn()
const mockOpenVotingRoomsPanel = vi.fn()
const mockShowShortcutsModal = vi.fn()
const mockSwitchLanguage = vi.fn()
const mockCollapseAllExceptToday = vi.fn()
const mockCloseSearch = vi.fn()
const mockCloseMenu = vi.fn()
const mockCloseAllOverlays = vi.fn()

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }))
}

describe("setupKeyboard", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIsOverlayOpen.mockReturnValue(false)
    document.body.innerHTML = ""

    setupKeyboard({
      expandDay: mockExpandDay,
      openFilterSelector: mockOpenFilterSelector,
      cycleTheme: mockCycleTheme,
      openVotingRoomsPanel: mockOpenVotingRoomsPanel,
      showShortcutsModal: mockShowShortcutsModal,
      switchLanguage: mockSwitchLanguage,
      collapseAllExceptToday: mockCollapseAllExceptToday,
      closeSearch: mockCloseSearch,
      closeMenu: mockCloseMenu,
      closeAllOverlays: mockCloseAllOverlays,
    })
  })

  afterEach(() => {
    _resetForTesting()
  })

  it("expands day 1-5 on number keys", () => {
    fireKey("1")
    expect(mockExpandDay).toHaveBeenCalledWith(0)
    fireKey("3")
    expect(mockExpandDay).toHaveBeenCalledWith(2)
  })

  it("opens filter selector on 'f'", () => {
    fireKey("f")
    expect(mockOpenFilterSelector).toHaveBeenCalled()
  })

  it("shows shortcuts modal on '?'", () => {
    fireKey("?")
    expect(mockShowShortcutsModal).toHaveBeenCalled()
  })

  it("ignores keys when focused on input", () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }))
    expect(mockOpenFilterSelector).not.toHaveBeenCalled()
  })

  it("closes overlays on Escape when overlay is open", () => {
    mockIsOverlayOpen.mockReturnValue(true)
    fireKey("Escape")
    expect(mockCloseSearch).toHaveBeenCalled()
    expect(mockCloseMenu).toHaveBeenCalled()
    expect(mockCloseAllOverlays).toHaveBeenCalled()
  })
})
