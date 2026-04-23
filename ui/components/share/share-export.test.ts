import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("../../voting/init", () => ({
  getActiveRoomPayload: () => null,
}))

import { buildDeepLink } from "./share-export"

const originalLocation = window.location

function setLocation(search: string): void {
  Object.defineProperty(window, "location", {
    value: {
      ...originalLocation,
      search,
      origin: "http://localhost",
      pathname: "/",
      href: `http://localhost/${search}`,
    },
    writable: true,
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(window, "location", { value: originalLocation, writable: true })
  vi.restoreAllMocks()
})

describe("buildDeepLink", () => {
  it("omits ?week= when not in archive mode", () => {
    setLocation("")
    const link = buildDeepLink(["mano"], "2026-04-20")
    expect(link).not.toContain("week=")
    expect(link).toContain("r=mano")
    expect(link).toContain("d=0") // Monday
  })

  it("preserves ?week= when shared from archive mode", () => {
    setLocation("?week=2026-W15")
    const link = buildDeepLink(["mano"], "2026-04-06") // Monday of W15
    expect(link).toContain("week=2026-W15")
    expect(link).toContain("r=mano")
    expect(link).toContain("d=0")
  })

  it("computes day index from the date itself, not from the current week", () => {
    // Shared date is from archived week W15 (a Tuesday).
    setLocation("?week=2026-W15")
    const link = buildDeepLink(["mano"], "2026-04-07") // Tuesday of W15
    expect(link).toContain("d=1")
  })

  it("omits d when date is a weekend", () => {
    setLocation("")
    const link = buildDeepLink(["mano"], "2026-04-11") // Saturday
    expect(link).toContain("r=mano")
    expect(link).not.toContain("d=")
  })

  it("omits r when selection has multiple restaurants", () => {
    setLocation("?week=2026-W15")
    const link = buildDeepLink(["mano", "baobar"], "2026-04-06")
    expect(link).toContain("week=2026-W15")
    expect(link).not.toContain("r=")
  })
})
