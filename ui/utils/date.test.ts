import { describe, it, expect, vi, afterEach } from "vitest"
import { getMondayOfWeek, getWeekDates, formatShortDate, isAvailableOnDay, isDataFromCurrentWeek, getLatestFetchTime } from "./date"

describe("getMondayOfWeek", () => {
  it("returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 2, 18)
    const monday = getMondayOfWeek(wed)
    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(16)
  })

  it("returns same day for a Monday", () => {
    const mon = new Date(2026, 2, 16)
    const monday = getMondayOfWeek(mon)
    expect(monday.getDate()).toBe(16)
  })

  it("returns Monday for a Sunday", () => {
    const sun = new Date(2026, 2, 22) // Sunday
    const monday = getMondayOfWeek(sun)
    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(16)
  })
})

describe("getWeekDates", () => {
  it("returns 5 dates starting from Monday", () => {
    const dates = getWeekDates(new Date(2026, 2, 18))
    expect(dates).toHaveLength(5)
    expect(dates[0].getDay()).toBe(1)
    expect(dates[4].getDay()).toBe(5)
  })
})

describe("formatShortDate", () => {
  it("formats date as D.M.", () => {
    expect(formatShortDate(new Date(2026, 2, 18))).toBe("18.3.")
  })
})

describe("isAvailableOnDay", () => {
  it("returns true when restaurant has no availableDays (always available)", () => {
    expect(isAvailableOnDay({}, "Montag")).toBe(true)
  })

  it("returns true when day is in availableDays", () => {
    expect(isAvailableOnDay({ availableDays: ["Montag", "Dienstag"] }, "Montag")).toBe(true)
  })

  it("returns false when day is not in availableDays", () => {
    expect(isAvailableOnDay({ availableDays: ["Montag", "Dienstag"] }, "Freitag")).toBe(false)
  })
})

describe("isDataFromCurrentWeek", () => {
  afterEach(() => vi.useRealTimers())

  it("returns true when fetchedAt is in the current week", () => {
    vi.useFakeTimers({ now: new Date("2026-03-20T12:00:00Z") }) // Friday
    expect(isDataFromCurrentWeek([{ fetchedAt: "2026-03-18T10:00:00Z" }])).toBe(true) // Wednesday same week
  })

  it("returns true on Monday for data fetched that day", () => {
    vi.useFakeTimers({ now: new Date("2026-03-16T08:00:00Z") }) // Monday
    expect(isDataFromCurrentWeek([{ fetchedAt: "2026-03-16T07:00:00Z" }])).toBe(true)
  })

  it("returns false when fetchedAt is from last week", () => {
    vi.useFakeTimers({ now: new Date("2026-03-20T12:00:00Z") }) // Friday
    expect(isDataFromCurrentWeek([{ fetchedAt: "2026-03-09T10:00:00Z" }])).toBe(false)
  })

  it("returns false for empty restaurant array", () => {
    expect(isDataFromCurrentWeek([])).toBe(false)
  })
})

describe("getLatestFetchTime", () => {
  it("returns the latest fetchedAt timestamp", () => {
    const result = getLatestFetchTime([
      { fetchedAt: "2026-03-18T09:00:00Z" },
      { fetchedAt: "2026-03-20T11:00:00Z" },
      { fetchedAt: "2026-03-19T08:00:00Z" },
    ])
    expect(result).toBe("2026-03-20T11:00:00Z")
  })

  it("returns null for empty array", () => {
    expect(getLatestFetchTime([])).toBeNull()
  })

  it("returns null when all fetchedAt are empty", () => {
    expect(getLatestFetchTime([{ fetchedAt: "" }, { fetchedAt: "" }])).toBeNull()
  })
})
