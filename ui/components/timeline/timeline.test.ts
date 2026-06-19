import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import type { Restaurant } from "../../types"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./timeline.css", () => ({}))

vi.mock("../../i18n/i18n", () => ({
  t: (k: string) => k,
  getLocale: () => "de-AT",
}))

vi.mock("../../icons", () => ({
  icons: { chevronRight: "<svg>▶</svg>" },
  restaurantIconSpan: (icon?: string) => `<span class="restaurant-icon">${icon ?? "utensils"}</span>`,
}))

vi.mock("../../utils/date", () => {
  const dateToIso = (d: Date) => `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  return {
    todayIndexInWeek: (dates: Date[], iso: string) => dates.findIndex(d => dateToIso(d) === iso),
    formatDayHeader: (d: Date) => d.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "short" }),
    dateToIso,
  }
})

vi.mock("../../app-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app-config")>()
  return { ...actual, todayIso: () => "2026-04-22" }
})

vi.mock("../../utils/dom", () => ({
  smoothScrollTo: vi.fn(),
  escapeHtml: (s: string) => s,
}))

vi.mock("../restaurant-section/restaurant-section", () => ({
  renderRestaurantSection: (opts: { restaurant: Restaurant; dayIndex: number }) =>
    `<section class="restaurant-section" data-restaurant-id="${opts.restaurant.id}">${opts.restaurant.title}</section>`,
}))

import { renderTimeline, expandDay, collapseAllExceptToday, rerenderExpandedDays } from "./timeline"

/* ── Helpers ────────────────────────────────────────────── */

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "r1", title: "Testaurant", url: "https://example.com", type: "full",
    fetchedAt: "2026-04-22T10:00:00Z", error: null, days: {
      "2026-04-22": { categories: [{ name: "Main", items: [] }], fetchedAt: "2026-04-22T08:00:00Z" },
    },
    ...overrides,
  }
}

// Week of 2026-04-20 (Mon) .. 2026-04-24 (Fri). Today is 2026-04-22 (Wed, index 2).
function makeWeekDates(): Date[] {
  const mon = new Date(2026, 3, 20) // April 20 2026
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

/* ── Tests ──────────────────────────────────────────────── */

// Use a single stable element so the module-level event listener stays attached
const el = document.createElement("div")
el.className = "timeline"

describe("timeline", () => {
  beforeAll(() => {
    document.body.appendChild(el)
  })

  beforeEach(() => {
    el.innerHTML = ""
  })

  describe("renderTimeline", () => {
    it("renders day sections for each day of the week", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      const sections = el.querySelectorAll(".day-section")
      expect(sections.length).toBe(5)
    })

    it("expands today by default", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      // Today is 2026-04-22 = index 2 (Wednesday)
      const todaySection = el.querySelector(".day-section[data-day-index='2']")
      expect(todaySection?.classList.contains("expanded")).toBe(true)
    })

    it("renders restaurant content in expanded day", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant({ title: "Schnitzelhaus" })],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      // Today (index 2) is expanded — check its content
      const todayContent = el.querySelector(".day-section[data-day-index='2'] .day-content")
      expect(todayContent?.innerHTML).toContain("Schnitzelhaus")
    })

    it("collapsed days have empty content", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      const secondDayContent = el.querySelector(".day-section[data-day-index='1'] .day-content")
      expect(secondDayContent?.innerHTML).toBe("")
    })
  })

  describe("day expand/collapse", () => {
    it("clicking a day header toggles expansion", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      const secondHeader = el.querySelector(".day-header[data-day-index='1']") as HTMLElement
      secondHeader.click()

      const secondSection = el.querySelector(".day-section[data-day-index='1']")
      expect(secondSection?.classList.contains("expanded")).toBe(true)
    })

    it("clicking an expanded day header collapses it", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      // Today (index 2) is expanded by default — click it to collapse
      const todayHeader = el.querySelector(".day-header[data-day-index='2']") as HTMLElement
      todayHeader.click()

      const todaySection = el.querySelector(".day-section[data-day-index='2']")
      expect(todaySection?.classList.contains("expanded")).toBe(false)
    })
  })

  describe("expandDay", () => {
    it("expands a collapsed day", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      expandDay(3)

      const section = el.querySelector(".day-section[data-day-index='3']")
      expect(section?.classList.contains("expanded")).toBe(true)
    })
  })

  describe("collapseAllExceptToday", () => {
    it("collapses all non-today days", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      // Expand days 0 and 1
      expandDay(0)
      expandDay(1)

      collapseAllExceptToday()

      // Today is index 2
      expect(el.querySelector(".day-section[data-day-index='2']")?.classList.contains("expanded")).toBe(true)
      expect(el.querySelector(".day-section[data-day-index='0']")?.classList.contains("expanded")).toBe(false)
      expect(el.querySelector(".day-section[data-day-index='1']")?.classList.contains("expanded")).toBe(false)
    })
  })

  describe("rerenderExpandedDays", () => {
    it("re-renders expanded day content without error", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getFilters: () => null,
      })

      expect(() => rerenderExpandedDays()).not.toThrow()
      // Today (index 2) is expanded and contains the restaurant
      expect(el.querySelector(".day-section[data-day-index='2'] .day-content")?.innerHTML).toContain("Testaurant")
    })
  })

})
