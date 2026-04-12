import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./more-menu.css", () => ({}))

vi.mock("../../icons", () => ({
  icons: {
    menu: "<svg>menu</svg>",
    search: "<svg>search</svg>",
    map: "<svg>map</svg>",
    dices: "<svg>dices</svg>",
    heart: "<svg>heart</svg>",
    sunMoon: "<svg>sunmoon</svg>",
    messageSquare: "<svg>msg</svg>",
    keyboard: "<svg>keyboard</svg>",
    x: "<svg>x</svg>",
  },
}))

vi.mock("../../i18n/i18n", () => ({
  t: (key: string) => key,
}))

vi.mock("../../constants", () => ({
  LANG_CHANGE_EVENT: "peckish:langchange",
}))

const mockRegisterOverlay = vi.fn()
const mockUnregisterOverlay = vi.fn()

vi.mock("../../utils/dom", () => ({
  registerOverlay: (...args: unknown[]) => mockRegisterOverlay(...args),
  unregisterOverlay: (...args: unknown[]) => mockUnregisterOverlay(...args),
  escapeHtml: (s: string) => s,
}))

/* ── Import after mocks ─────────────────────────────────── */

import { setupMoreMenu, closeMenu } from "./more-menu"
import type { MoreMenuCallbacks } from "./more-menu"

/* ── Helpers ─────────────────────────────────────────────── */

function makeCallbacks(overrides: Partial<MoreMenuCallbacks> = {}): MoreMenuCallbacks {
  return {
    onSearch: vi.fn(),
    onMap: vi.fn(),
    onDice: vi.fn(),
    isDiceAvailable: vi.fn().mockReturnValue(true),
    onVotingRooms: vi.fn(),
    onTheme: vi.fn(),
    onFeedback: vi.fn(),
    onShortcuts: vi.fn(),
    ...overrides,
  }
}

function makeDOM() {
  document.body.innerHTML = ""
  const overlay = document.createElement("div")
  overlay.hidden = true
  const menu = document.createElement("div")
  const trigger = document.createElement("button")
  document.body.appendChild(overlay)
  document.body.appendChild(menu)
  document.body.appendChild(trigger)
  return { overlay, menu, trigger }
}

function openMenu(overlay: HTMLElement, trigger: HTMLElement) {
  // Clicking trigger while hidden opens it
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

/* ── Tests ──────────────────────────────────────────────── */

// Ensure any open menu state is cleaned up between tests
afterEach(() => closeMenu())

describe("setupMoreMenu initialization", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("sets trigger innerHTML to menu icon", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    expect(trigger.innerHTML).toContain("menu")
  })

  it("does not open menu on init - overlay stays hidden", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    expect(overlay.hidden).toBe(true)
  })
})

describe("opening the menu", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("trigger click shows the overlay", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    expect(overlay.hidden).toBe(false)
  })

  it("registers overlay with dom utility on open", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    expect(mockRegisterOverlay).toHaveBeenCalledWith("more-menu")
  })

  it("renders menu items into the menu element", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    expect(menu.querySelectorAll("[data-action]").length).toBeGreaterThan(0)
  })

  it("renders dice item when isDiceAvailable returns true", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks({ isDiceAvailable: vi.fn().mockReturnValue(true) })
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    expect(menu.querySelector("[data-action='dice']")).not.toBeNull()
  })

  it("does not render dice item when isDiceAvailable returns false", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks({ isDiceAvailable: vi.fn().mockReturnValue(false) })
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    expect(menu.querySelector("[data-action='dice']")).toBeNull()
  })
})

describe("closeMenu", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("trigger click a second time closes the menu", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger) // open
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })) // close
    expect(overlay.hidden).toBe(true)
  })

  it("closeMenu() hides the overlay", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    closeMenu()
    expect(overlay.hidden).toBe(true)
  })

  it("closeMenu() calls unregisterOverlay", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    closeMenu()
    expect(mockUnregisterOverlay).toHaveBeenCalledWith("more-menu")
  })

  it("clicking the overlay backdrop closes the menu", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(overlay.hidden).toBe(true)
  })

})

describe("menu item click callbacks", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  function clickAction(menu: HTMLElement, action: string) {
    const btn = menu.querySelector(`[data-action="${action}"]`) as HTMLElement
    if (!btn) throw new Error(`No button with data-action="${action}"`)
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  }

  it("search action calls onSearch callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "search")
    expect(callbacks.onSearch).toHaveBeenCalledOnce()
  })

  it("map action calls onMap callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "map")
    expect(callbacks.onMap).toHaveBeenCalledOnce()
  })

  it("dice action calls onDice callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "dice")
    expect(callbacks.onDice).toHaveBeenCalledOnce()
  })

  it("voting-rooms action calls onVotingRooms callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "voting-rooms")
    expect(callbacks.onVotingRooms).toHaveBeenCalledOnce()
  })

  it("theme action calls onTheme callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "theme")
    expect(callbacks.onTheme).toHaveBeenCalledOnce()
  })

  it("feedback action calls onFeedback callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "feedback")
    expect(callbacks.onFeedback).toHaveBeenCalledOnce()
  })

  it("shortcuts action calls onShortcuts callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks()
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "shortcuts")
    expect(callbacks.onShortcuts).toHaveBeenCalledOnce()
  })

  it("clicking a menu item closes the menu before calling the callback", () => {
    const { overlay, menu, trigger } = makeDOM()
    let menuHiddenWhenCalled = false
    const callbacks = makeCallbacks({
      onSearch: vi.fn().mockImplementation(() => {
        menuHiddenWhenCalled = overlay.hidden
      }),
    })
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    clickAction(menu, "search")
    expect(menuHiddenWhenCalled).toBe(true)
  })
})

describe("language change updates menu content", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("dispatching LANG_CHANGE_EVENT re-renders menu items when open", () => {
    const { overlay, menu, trigger } = makeDOM()
    setupMoreMenu(overlay, menu, trigger, makeCallbacks())
    openMenu(overlay, trigger)
    const beforeCount = menu.querySelectorAll("[data-action]").length
    document.dispatchEvent(new Event("peckish:langchange"))
    const afterCount = menu.querySelectorAll("[data-action]").length
    // Content should be re-rendered (same number of items but re-built)
    expect(afterCount).toBe(beforeCount)
    expect(afterCount).toBeGreaterThan(0)
  })

  it("lang change listener is removed after menu closes", () => {
    const { overlay, menu, trigger } = makeDOM()
    const callbacks = makeCallbacks({ isDiceAvailable: vi.fn().mockReturnValue(true) })
    setupMoreMenu(overlay, menu, trigger, callbacks)
    openMenu(overlay, trigger)
    closeMenu()
    // Manually clear the menu to detect if it gets re-filled
    menu.innerHTML = ""
    document.dispatchEvent(new Event("peckish:langchange"))
    // After close, no re-render should happen - _langListener was removed by closeMenu()
    // The menu element was cleared; nothing should re-fill it
    expect(menu.innerHTML).toBe("")
  })
})
