import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import type { Restaurant } from "../../types"
import type { VoteMapEntry } from "../../voting/types"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./timeline.css", () => ({}))

vi.mock("../../constants", () => ({
  DAYS: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
}))

vi.mock("../../i18n/i18n", () => ({
  t: (k: string) => k,
  getLocale: () => "de-AT",
}))

vi.mock("../../icons", () => ({
  icons: { chevronRight: "<svg>▶</svg>", crown: "<svg>♛</svg>" },
  restaurantIconSpan: (icon?: string) => `<span class="restaurant-icon">${icon ?? "utensils"}</span>`,
}))

vi.mock("../../utils/date", () => ({
  todayDayIndex: () => 0,
  formatDayHeader: (d: Date) => d.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "short" }),
}))

vi.mock("../../utils/dom", () => ({
  smoothScrollTo: vi.fn(),
  escapeHtml: (s: string) => s,
}))

vi.mock("../restaurant-section/restaurant-section", () => ({
  renderRestaurantSection: (opts: { restaurant: Restaurant; voteCount: number; userVoted: boolean; dayIndex: number }) => {
    const votedClass = opts.userVoted ? " voted" : ""
    const activeClass = opts.voteCount > 0 ? " vote-active" : ""
    const countStr = opts.voteCount > 0 ? `<span class="vote-count">${opts.voteCount}</span>` : ""
    return `<section class="restaurant-section"><button class="vote-btn${votedClass}${activeClass}" data-vote-id="${opts.restaurant.id}"><span class="vote-check">♥</span>${countStr}</button>${opts.restaurant.title}</section>`
  },
  renderVoterDots: (voters: unknown[]) =>
    voters.length ? `<span class="voter-dots">${voters.length}</span>` : "",
}))

import { renderTimeline, expandDay, collapseAllExceptToday, rerenderExpandedDays, updateVotes } from "./timeline"

/* ── Helpers ────────────────────────────────────────────── */

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "r1", title: "Testaurant", url: "https://example.com", type: "full",
    fetchedAt: "2026-04-07T10:00:00Z", error: null, days: {
      Montag: { categories: [{ name: "Main", items: [] }] },
    },
    ...overrides,
  }
}

function makeWeekDates(): Date[] {
  const mon = new Date("2026-04-06")
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

function emptyVotes(): Map<string, VoteMapEntry> {
  return new Map()
}

function makeVotes(entries: Record<string, Partial<VoteMapEntry>>): Map<string, VoteMapEntry> {
  const map = new Map<string, VoteMapEntry>()
  for (const [id, partial] of Object.entries(entries)) {
    map.set(id, { count: 0, userVoted: false, voters: [], ...partial })
  }
  return map
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
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      const sections = el.querySelectorAll(".day-section")
      expect(sections.length).toBe(5)
    })

    it("expands today by default", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      const firstSection = el.querySelector(".day-section[data-day-index='0']")
      expect(firstSection?.classList.contains("expanded")).toBe(true)
    })

    it("renders restaurant content in expanded day", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant({ title: "Schnitzelhaus" })],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      expect(el.querySelector(".day-content")?.innerHTML).toContain("Schnitzelhaus")
    })

    it("collapsed days have empty content", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
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
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
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
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      const firstHeader = el.querySelector(".day-header[data-day-index='0']") as HTMLElement
      firstHeader.click()

      const firstSection = el.querySelector(".day-section[data-day-index='0']")
      expect(firstSection?.classList.contains("expanded")).toBe(false)
    })
  })

  describe("expandDay", () => {
    it("expands a collapsed day", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      expandDay(2)

      const section = el.querySelector(".day-section[data-day-index='2']")
      expect(section?.classList.contains("expanded")).toBe(true)
    })
  })

  describe("collapseAllExceptToday", () => {
    it("collapses all non-today days", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      // Expand days 1 and 2
      expandDay(1)
      expandDay(2)

      collapseAllExceptToday()

      expect(el.querySelector(".day-section[data-day-index='0']")?.classList.contains("expanded")).toBe(true)
      expect(el.querySelector(".day-section[data-day-index='1']")?.classList.contains("expanded")).toBe(false)
      expect(el.querySelector(".day-section[data-day-index='2']")?.classList.contains("expanded")).toBe(false)
    })
  })

  describe("rerenderExpandedDays", () => {
    it("re-renders expanded day content without error", () => {
      renderTimeline(el, {
        restaurants: [makeRestaurant()],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      expect(() => rerenderExpandedDays()).not.toThrow()
      expect(el.querySelector(".day-content")?.innerHTML).toContain("Testaurant")
    })
  })

  describe("vote delegation", () => {
    it("calls onVote when vote button is clicked", () => {
      const onVote = vi.fn()
      renderTimeline(el, {
        restaurants: [makeRestaurant({ id: "pizza1" })],
        weekDates: makeWeekDates(),
        getVotes: () => emptyVotes(),
        getFilters: () => null,
        onVote,
      })

      const voteBtn = el.querySelector(".vote-btn") as HTMLElement
      if (voteBtn) {
        voteBtn.click()
        expect(onVote).toHaveBeenCalledWith("pizza1", 0)
      }
    })
  })

  describe("updateVotes", () => {
    it("updates vote counts in the DOM", () => {
      let votes = emptyVotes()
      renderTimeline(el, {
        restaurants: [makeRestaurant({ id: "r1" })],
        weekDates: makeWeekDates(),
        getVotes: () => votes,
        getFilters: () => null,
        onVote: vi.fn(),
      })

      // Now update with a vote
      votes = makeVotes({ r1: { count: 3, userVoted: true, voters: [] } })
      updateVotes()

      const voteBtn = el.querySelector(".vote-btn[data-vote-id='r1']")
      expect(voteBtn?.classList.contains("voted")).toBe(true)
      expect(voteBtn?.querySelector(".vote-count")?.textContent).toBe("3")
    })

    it("removes vote count when votes drop to zero", () => {
      let votes = makeVotes({ r1: { count: 2 } })
      renderTimeline(el, {
        restaurants: [makeRestaurant({ id: "r1" })],
        weekDates: makeWeekDates(),
        getVotes: () => votes,
        getFilters: () => null,
        onVote: vi.fn(),
      })

      votes = makeVotes({ r1: { count: 0 } })
      updateVotes()

      const voteBtn = el.querySelector(".vote-btn[data-vote-id='r1']")
      expect(voteBtn?.querySelector(".vote-count")).toBeNull()
    })
  })

  describe("leader pills", () => {
    it("shows leader pills on collapsed days with votes", () => {
      renderTimeline(el, {
        restaurants: [
          makeRestaurant({ id: "r1", title: "Pizza Place", icon: "pizza" }),
          makeRestaurant({ id: "r2", title: "Burger Joint", icon: "burger" }),
        ],
        weekDates: makeWeekDates(),
        getVotes: (dayIndex: number) =>
          dayIndex === 1
            ? makeVotes({ r1: { count: 5 }, r2: { count: 2 } })
            : emptyVotes(),
        getFilters: () => null,
        onVote: vi.fn(),
      })

      // Day 1 is collapsed - should show leader pills in the count area
      const countEl = el.querySelector(".day-section[data-day-index='1'] .day-header-count")
      expect(countEl?.innerHTML).toContain("leader-pill")
      expect(countEl?.innerHTML).toContain("Pizza Place")
    })
  })
})
