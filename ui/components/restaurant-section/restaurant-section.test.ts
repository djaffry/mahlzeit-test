import { describe, it, expect, vi } from "vitest"
import type { Restaurant, DayMenu, Voter } from "../../types"

vi.mock("./restaurant-section.css", () => ({}))
vi.mock("../../icons", () => ({
  icons: { externalLink: "<svg>ext</svg>", mapPin: "<svg>pin</svg>", heart: "<svg>heart</svg>" },
  restaurantIconSpan: (icon?: string) => `<span class="restaurant-icon">${icon ?? "utensils"}</span>`,
}))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("../../utils/date", () => ({
  isAvailableOnDay: () => true,
  formatAvailableDays: () => "Mon-Fri",
}))
vi.mock("../../constants", () => ({
  DAYS: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
  BADGES: [{ prop: "edenred", i18n: "badge.edenred", cssVar: "--tag-red" }],
}))
vi.mock("../menu-item/menu-item", () => ({
  renderItem: (item: { title: string }) => `<div class="menu-item">${item.title}</div>`,
}))

import { renderRestaurantSection } from "./restaurant-section"

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "r1", title: "Test", url: "https://example.com", type: "full",
    fetchedAt: "2026-04-07T10:00:00Z", error: null, days: {}, ...overrides,
  }
}

function makeMenu(items: { title: string; tags: string[] }[]): DayMenu {
  return { categories: [{ name: "Main", items: items.map(i => ({ ...i, description: null, price: null, allergens: null })) }] }
}

describe("renderRestaurantSection", () => {
  it("renders all items when filters is null (show all)", () => {
    const r = makeRestaurant()
    const menu = makeMenu([
      { title: "Schnitzel", tags: ["meat"] },
      { title: "Salad", tags: ["vegan"] },
    ])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, voters: [], dayIndex: 0, filters: null })
    expect(html).toContain("Schnitzel")
    expect(html).toContain("Salad")
  })

  it("filters items when filters set is provided", () => {
    const r = makeRestaurant()
    const menu = makeMenu([
      { title: "Schnitzel", tags: ["meat"] },
      { title: "Salad", tags: ["vegan"] },
    ])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, voters: [], dayIndex: 0, filters: new Set(["vegan"]) })
    expect(html).not.toContain("Schnitzel")
    expect(html).toContain("Salad")
  })

  it("shows items with no tags regardless of filter", () => {
    const r = makeRestaurant()
    const menu = makeMenu([
      { title: "Daily Special", tags: [] },
      { title: "Steak", tags: ["meat"] },
    ])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, voters: [], dayIndex: 0, filters: new Set(["vegan"]) })
    expect(html).toContain("Daily Special")
    expect(html).not.toContain("Steak")
  })

  it("returns empty string when all items are filtered out", () => {
    const r = makeRestaurant()
    const menu = makeMenu([
      { title: "Steak", tags: ["meat"] },
    ])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, voters: [], dayIndex: 0, filters: new Set(["vegan"]) })
    expect(html).toBe("")
  })
})
