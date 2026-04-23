import { describe, it, expect, vi, afterEach } from "vitest"
import {
  getArchiveWeek,
  isArchiveMode,
  getDataBasePath,
  formatWeekLabel,
  fetchArchiveWeeks,
  enterArchive,
  exitArchive,
  getArchiveWeekDates,
  _resetArchiveWeeksCache,
} from "./archive"
import { config } from "../config"

const originalLocation = window.location

afterEach(() => {
  Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true })
  vi.restoreAllMocks()
  _resetArchiveWeeksCache()
})

function stubLocation(search: string): void {
  Object.defineProperty(window, "location", {
    value: { ...originalLocation, search, pathname: "/", href: `http://localhost/${search}` },
    writable: true,
    configurable: true,
  })
}

describe("getArchiveWeek", () => {
  it("returns null when ?week is absent", () => {
    stubLocation("")
    expect(getArchiveWeek()).toBeNull()
  })

  it("returns the week when ?week=YYYY-Www is valid", () => {
    stubLocation("?week=2026-W15")
    expect(getArchiveWeek()).toBe("2026-W15")
  })

  it("returns null for malformed ?week values", () => {
    stubLocation("?week=not-a-week")
    expect(getArchiveWeek()).toBeNull()
    stubLocation("?week=2026-W5")  // single-digit week
    expect(getArchiveWeek()).toBeNull()
    stubLocation("?week=")
    expect(getArchiveWeek()).toBeNull()
  })

  it("rejects out-of-range ISO week numbers", () => {
    stubLocation("?week=2026-W00")
    expect(getArchiveWeek()).toBeNull()
    stubLocation("?week=2026-W54")
    expect(getArchiveWeek()).toBeNull()
    stubLocation("?week=2026-W99")
    expect(getArchiveWeek()).toBeNull()
  })

  it("accepts the boundary week numbers W01 and W53", () => {
    stubLocation("?week=2026-W01")
    expect(getArchiveWeek()).toBe("2026-W01")
    stubLocation("?week=2026-W53")
    expect(getArchiveWeek()).toBe("2026-W53")
  })
})

describe("isArchiveMode", () => {
  it("returns false when ?week is absent", () => {
    stubLocation("")
    expect(isArchiveMode()).toBe(false)
  })

  it("returns true when ?week is present and valid", () => {
    stubLocation("?week=2026-W15")
    expect(isArchiveMode()).toBe(true)
  })
})

describe("getDataBasePath", () => {
  it("returns config.dataPath when not in archive mode", () => {
    stubLocation("")
    expect(getDataBasePath()).toBe(config.dataPath)
  })

  it("returns archivePath/week when in archive mode", () => {
    stubLocation("?week=2026-W15")
    expect(getDataBasePath()).toBe(`${config.archivePath}/2026-W15`)
  })
})

describe("formatWeekLabel", () => {
  it("includes the week's Monday short-date and week number", () => {
    // 2026-W15 → Monday = 2026-04-06. Both en ("Apr 6") and de ("6. Apr.") contain "Apr" and "6".
    const label = formatWeekLabel("2026-W15")
    expect(label).toMatch(/Apr/)
    expect(label).toMatch(/\b6\b/)
    expect(label).toContain("W15")
  })

  it("returns the week string unchanged for malformed input", () => {
    expect(formatWeekLabel("garbage")).toBe("garbage")
  })
})

describe("getArchiveWeekDates", () => {
  it("returns null when not in archive mode", () => {
    stubLocation("")
    expect(getArchiveWeekDates()).toBeNull()
  })

  it("returns Monday–Friday of the archive week, not the current week", () => {
    stubLocation("?week=2026-W15")
    const dates = getArchiveWeekDates()
    expect(dates).not.toBeNull()
    expect(dates).toHaveLength(5)
    // 2026-W15 Monday = April 6, 2026; Friday = April 10
    expect(dates![0].getFullYear()).toBe(2026)
    expect(dates![0].getMonth()).toBe(3) // April
    expect(dates![0].getDate()).toBe(6)
    expect(dates![4].getDate()).toBe(10)
  })

  it("returns null for a malformed week param", () => {
    stubLocation("?week=garbage")
    expect(getArchiveWeekDates()).toBeNull()
  })
})

describe("fetchArchiveWeeks", () => {
  it("returns the weeks array on a valid manifest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ weeks: ["2026-W16", "2026-W15", "2026-W14"] }),
    })))
    const weeks = await fetchArchiveWeeks()
    expect(weeks).toEqual(["2026-W16", "2026-W15", "2026-W14"])
  })

  it("returns [] when the manifest 404s", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })))
    const weeks = await fetchArchiveWeeks()
    expect(weeks).toEqual([])
  })

  it("returns [] on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    const weeks = await fetchArchiveWeeks()
    expect(weeks).toEqual([])
  })

  it("returns [] when the payload is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ notWhatYouExpected: true }),
    })))
    const weeks = await fetchArchiveWeeks()
    expect(weeks).toEqual([])
  })
})

describe("enterArchive / exitArchive", () => {
  it("enterArchive calls location.assign with ?week=<week>", () => {
    const assign = vi.fn()
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign, search: "", pathname: "/" },
      writable: true,
      configurable: true,
    })
    enterArchive("2026-W15")
    expect(assign).toHaveBeenCalledWith("?week=2026-W15")
  })

  it("exitArchive calls location.assign with the bare pathname", () => {
    const assign = vi.fn()
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign, search: "?week=2026-W15", pathname: "/" },
      writable: true,
      configurable: true,
    })
    exitArchive()
    expect(assign).toHaveBeenCalledWith("/")
  })
})
