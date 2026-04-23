import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../utils/dom", () => ({ flashAndScroll: vi.fn() }))
vi.mock("../../utils/today", () => ({ todayIso: vi.fn(() => "2026-04-20") })) // Monday = index 0

import { handleDeepLink } from "./deep-link"
import { flashAndScroll } from "../../utils/dom"
import { todayIso } from "../../utils/today"

const mockExpandDay = vi.fn()

function setSearch(search: string): void {
  Object.defineProperty(window, "location", {
    value: {
      search,
      origin: "http://localhost",
      pathname: "/",
      href: `http://localhost/${search}`,
    },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  mockExpandDay.mockReset()
  vi.mocked(flashAndScroll).mockReset()
  vi.mocked(todayIso).mockReturnValue("2026-04-20") // Monday = index 0
  setSearch("")
  window.history.replaceState = vi.fn()
  document.body.innerHTML = ""
})

describe("handleDeepLink - no params", () => {
  it("does nothing when no URL params are present", () => {
    setSearch("")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(mockExpandDay).not.toHaveBeenCalled()
    expect(flashAndScroll).not.toHaveBeenCalled()
    expect(window.history.replaceState).not.toHaveBeenCalled()
  })
})

describe("handleDeepLink - d param", () => {
  it("expands the specified day index", () => {
    setSearch("?d=2")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(mockExpandDay).toHaveBeenCalledWith(2)
  })

  it("cleans URL params after handling", () => {
    setSearch("?d=1")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/")
  })

  it("falls back to day 0 for negative day index", () => {
    setSearch("?d=-1")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(mockExpandDay).toHaveBeenCalledWith(0)
  })

  it("ignores day index >= 5", () => {
    setSearch("?d=5")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("falls back to day 0 for NaN day index", () => {
    setSearch("?d=abc")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(mockExpandDay).toHaveBeenCalledWith(0)
  })

  it("still cleans URL when day index is invalid", () => {
    setSearch("?d=-1")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(window.history.replaceState).toHaveBeenCalled()
  })
})

describe("handleDeepLink - r param", () => {
  it("expands today's day and scrolls to restaurant element", () => {
    vi.mocked(todayIso).mockReturnValue("2026-04-21") // Tuesday = index 1
    setSearch("?r=mano")
    const section = document.createElement("div")
    section.id = "r-1-mano"
    document.body.appendChild(section)

    // rAF fires synchronously via jsdom - just call directly
    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    handleDeepLink({ expandDay: mockExpandDay })

    expect(mockExpandDay).toHaveBeenCalledWith(1)
    expect(flashAndScroll).toHaveBeenCalledWith(section)

    window.requestAnimationFrame = origRAF
  })

  it("does not call flashAndScroll when element not in DOM", () => {
    vi.mocked(todayIso).mockReturnValue("2026-04-20") // Monday = index 0
    setSearch("?r=nonexistent")

    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    handleDeepLink({ expandDay: mockExpandDay })

    expect(flashAndScroll).not.toHaveBeenCalled()

    window.requestAnimationFrame = origRAF
  })

  it("cleans URL params after handling", () => {
    setSearch("?r=mano")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/")
  })
})

describe("handleDeepLink - d and r params together", () => {
  it("expands specified day and scrolls to restaurant", () => {
    setSearch("?d=3&r=bistro")
    const section = document.createElement("div")
    section.id = "r-3-bistro"
    document.body.appendChild(section)

    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    handleDeepLink({ expandDay: mockExpandDay })

    expect(mockExpandDay).toHaveBeenCalledWith(3)
    expect(flashAndScroll).toHaveBeenCalledWith(section)

    window.requestAnimationFrame = origRAF
  })
})

describe("handleDeepLink - preserves unrelated params", () => {
  it("preserves ?week= when stripping ?r / ?d", () => {
    setSearch("?week=2026-W15&d=2&r=mano")
    handleDeepLink({ expandDay: mockExpandDay })
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/?week=2026-W15")
  })
})
