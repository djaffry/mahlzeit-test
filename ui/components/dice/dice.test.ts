import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Restaurant } from "../../types"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./dice.css", () => ({}))

const mockTodayDayIndex = vi.fn()
const mockIsAvailableOnDay = vi.fn()
const mockIsDataFromCurrentWeek = vi.fn()

vi.mock("../../utils/date", () => ({
  todayDayIndex: () => mockTodayDayIndex(),
  isAvailableOnDay: (...args: unknown[]) => mockIsAvailableOnDay(...args),
  isDataFromCurrentWeek: (...args: unknown[]) => mockIsDataFromCurrentWeek(...args),
}))

vi.mock("../../utils/dom", () => ({
  prefersReducedMotion: () => true, // skip animation
  persistentHighlight: vi.fn(),
}))

vi.mock("../../utils/haptic", () => ({
  haptic: vi.fn(),
}))

const mockExpandDay = vi.fn()

vi.mock("../../constants", () => ({
  DAYS: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
}))

/* ── Import after mocks ─────────────────────────────────── */

import { isAvailable, roll, setup } from "./dice"

/* ── Helpers ─────────────────────────────────────────────── */

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "rest-1",
    title: "Test Restaurant",
    url: "",
    type: "full",
    icon: undefined,
    fetchedAt: "2026-04-07T10:00:00Z",
    error: null,
    days: {},
    ...overrides,
  }
}

function makeMenuRestaurant(dayName: string, categories: { name: string; items: { title: string }[] }[]): Restaurant {
  return makeRestaurant({
    id: "rest-menu",
    title: "Menu Restaurant",
    fetchedAt: "2026-04-07T10:00:00Z",
    days: {
      [dayName]: { categories: categories.map(c => ({ name: c.name, items: c.items.map(i => ({ title: i.title, description: null, price: null, tags: [], allergens: null })) })) },
    },
  })
}

/* ── Tests ──────────────────────────────────────────────── */

describe("isAvailable", () => {
  beforeEach(() => {
    // Reset module-level state by setting up fresh
    mockTodayDayIndex.mockReturnValue(2) // Wednesday
    mockIsDataFromCurrentWeek.mockReturnValue(true)
    document.body.innerHTML = ""
  })

  it("returns false when no restaurants getter is set", () => {
    // Re-import fresh copy would be needed - instead we can test this indirectly
    // by verifying it is false before setup is called. Since setup already runs
    // in other tests via module state, we verify behaviour after setup with an
    // empty getter.
    setup({ getAllRestaurants: () => [], expandDay: mockExpandDay })
    mockIsDataFromCurrentWeek.mockReturnValue(false)
    expect(isAvailable()).toBe(false)
  })

  it("returns false when today is a weekend (todayDayIndex < 0)", () => {
    mockTodayDayIndex.mockReturnValue(-1)
    const restaurant = makeMenuRestaurant("Mittwoch", [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }])
    setup({ getAllRestaurants: () => [restaurant], expandDay: mockExpandDay })
    expect(isAvailable()).toBe(false)
  })

  it("returns false when data is stale", () => {
    mockTodayDayIndex.mockReturnValue(2)
    mockIsDataFromCurrentWeek.mockReturnValue(false)
    const restaurant = makeMenuRestaurant("Mittwoch", [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }])
    setup({ getAllRestaurants: () => [restaurant], expandDay: mockExpandDay })
    expect(isAvailable()).toBe(false)
  })

  it("returns true when restaurants have menus and data is current", () => {
    mockTodayDayIndex.mockReturnValue(2)
    mockIsDataFromCurrentWeek.mockReturnValue(true)
    const restaurant = makeMenuRestaurant("Mittwoch", [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }])
    setup({ getAllRestaurants: () => [restaurant], expandDay: mockExpandDay })
    expect(isAvailable()).toBe(true)
  })

  it("excludes link-type restaurants from stale check", () => {
    mockTodayDayIndex.mockReturnValue(2)
    // Only a link restaurant - isDataFromCurrentWeek receives empty array
    mockIsDataFromCurrentWeek.mockImplementation((arr: unknown[]) => arr.length === 0 ? false : true)
    const linkRestaurant = makeRestaurant({ type: "link", fetchedAt: "2026-04-07T10:00:00Z" })
    setup({ getAllRestaurants: () => [linkRestaurant], expandDay: mockExpandDay })
    // isDataFromCurrentWeek([]) = false, so isAvailable = false
    expect(isAvailable()).toBe(false)
  })
})

describe("roll – candidate filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockTodayDayIndex.mockReturnValue(2) // Wednesday = index 2 → DAYS[2] = "Mittwoch"
    mockIsDataFromCurrentWeek.mockReturnValue(true)
    mockIsAvailableOnDay.mockReturnValue(true)
    mockExpandDay.mockReset()
    document.body.innerHTML = ""
  })

  afterEach(() => {
    // Advance past ROLL_COOLDOWN_MS (2000ms) to reset _rolling before restoring real timers
    vi.advanceTimersByTime(3000)
    vi.useRealTimers()
  })

  it("does nothing when not available (weekend)", () => {
    mockTodayDayIndex.mockReturnValue(-1)
    setup({ getAllRestaurants: () => [], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("does nothing when no candidates exist (no menus)", () => {
    const restaurant = makeRestaurant({ type: "full", days: {} })
    setup({ getAllRestaurants: () => [restaurant], expandDay: mockExpandDay })
    // No menus for today → no candidates
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("rolls when a menu restaurant has items for today", () => {
    const restaurant = makeMenuRestaurant("Mittwoch", [
      { name: "Hauptspeise", items: [{ title: "Schnitzel" }, { title: "Gulasch" }] },
    ])
    setup({ getAllRestaurants: () => [restaurant], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).toHaveBeenCalledWith(2, { scroll: false })
  })

  it("excludes dessert categories from item candidates - but link candidates still work", () => {
    // Only dessert category → no item candidates
    const restaurant = makeMenuRestaurant("Mittwoch", [
      { name: "Dessert", items: [{ title: "Kuchen" }] },
    ])
    // Link restaurant to ensure there's still a candidate
    const linkRestaurant = makeRestaurant({ id: "link-1", type: "link", fetchedAt: "2026-04-07T10:00:00Z" })
    // The dessert restaurant has fetchedAt so isDataFromCurrentWeek(nonLinkRestaurants) is called with [restaurant]
    setup({ getAllRestaurants: () => [restaurant, linkRestaurant], expandDay: mockExpandDay })
    // Should still roll via link candidate
    roll()
    expect(mockExpandDay).toHaveBeenCalledWith(2, { scroll: false })
  })

  it("excludes soup categories from candidates - no roll when only soup", () => {
    const soupOnly = makeMenuRestaurant("Mittwoch", [
      { name: "Suppe", items: [{ title: "Tomatensuppe" }] },
    ])
    setup({ getAllRestaurants: () => [soupOnly], expandDay: mockExpandDay })
    // No valid candidates → no roll
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("excludes side-dish (Beilage) categories from candidates", () => {
    const beilageOnly = makeMenuRestaurant("Mittwoch", [
      { name: "Beilage", items: [{ title: "Pommes" }] },
    ])
    setup({ getAllRestaurants: () => [beilageOnly], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("excludes cake categories matching EXCLUDE_CAT_RE", () => {
    const kuchen = makeMenuRestaurant("Mittwoch", [
      { name: "Kuchen", items: [{ title: "Schwarzwälder" }] },
    ])
    setup({ getAllRestaurants: () => [kuchen], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("includes link restaurants that are available today", () => {
    mockIsAvailableOnDay.mockReturnValue(true)
    // Also need a non-link restaurant so isDataFromCurrentWeek gets a non-empty array
    const menuRest = makeMenuRestaurant("Mittwoch", [
      { name: "Hauptspeise", items: [{ title: "Schnitzel" }] },
    ])
    const linkRestaurant = makeRestaurant({ id: "link-1", type: "link", fetchedAt: "2026-04-07T10:00:00Z" })
    setup({ getAllRestaurants: () => [menuRest, linkRestaurant], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).toHaveBeenCalledWith(2, { scroll: false })
  })

  it("excludes link restaurants not available today", () => {
    mockIsAvailableOnDay.mockReturnValue(false)
    const linkRestaurant = makeRestaurant({ id: "link-1", type: "link", fetchedAt: "2026-04-07T10:00:00Z" })
    setup({ getAllRestaurants: () => [linkRestaurant], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).not.toHaveBeenCalled()
  })

  it("mixes item and link candidates in the pool", () => {
    mockIsAvailableOnDay.mockReturnValue(true)
    const menuRest = makeMenuRestaurant("Mittwoch", [
      { name: "Hauptspeise", items: [{ title: "Schnitzel" }] },
    ])
    const linkRest = makeRestaurant({ id: "link-1", type: "link", fetchedAt: "2026-04-07T10:00:00Z" })
    setup({ getAllRestaurants: () => [menuRest, linkRest], expandDay: mockExpandDay })
    roll()
    expect(mockExpandDay).toHaveBeenCalledWith(2, { scroll: false })
  })
})
