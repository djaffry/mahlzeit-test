import { describe, it, expect, vi } from "vitest"
import type { Restaurant, DayMenu, Voter } from "../../types"

vi.mock("./restaurant-section.css", () => ({}))
vi.mock("../favorites/favorites.css", () => ({}))
vi.mock("../../icons", () => ({
  icons: { externalLink: "<svg>ext</svg>", mapPin: "<svg>pin</svg>", heart: "<svg>heart</svg>", pin: "<svg>thumbtack</svg>" },
  restaurantIconSpan: (icon?: string) => `<span class="restaurant-icon">${icon ?? "utensils"}</span>`,
}))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("../../utils/date", () => ({
  isAvailableOnDay: () => true,
  formatAvailableDays: () => "Mon-Fri",
}))
vi.mock("../../constants", () => ({
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
  return { categories: [{ name: "Main", items: items.map(i => ({ ...i, description: null, price: null, allergens: null })) }], fetchedAt: "2026-04-07T10:00:00Z" }
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

  it("renders pin button when isPinned is false", () => {
    const r = makeRestaurant()
    const menu = makeMenu([{ title: "Dish", tags: [] }])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, dayIndex: 0, isPinned: false })
    expect(html).toContain('class="pin-btn"')
    expect(html).not.toContain('pin-btn pinned')
  })

  it("renders pin button with pinned class when isPinned is true", () => {
    const r = makeRestaurant()
    const menu = makeMenu([{ title: "Dish", tags: [] }])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, dayIndex: 0, isPinned: true })
    expect(html).toContain('pin-btn pinned')
  })

  it("renders pin button on link cards too", () => {
    const r = makeRestaurant({ type: "link" })
    const html = renderRestaurantSection({ restaurant: r, dayMenu: undefined, voteCount: 0, userVoted: false, dayIndex: 0, isPinned: false })
    expect(html).toContain('pin-btn')
  })

  it("no longer renders the old header icon link button", () => {
    const r = makeRestaurant()
    const menu = makeMenu([{ title: "Dish", tags: [] }])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, dayIndex: 0 })
    expect(html).not.toContain('class="restaurant-website-link"')
  })

  it.each([
    { type: "link" as const, dayMenu: undefined, expectedLabel: "card.menuOnWebsite" },
    { type: "full" as const, dayMenu: undefined, expectedLabel: "card.noMenu" },
    { type: "full" as const, dayMenu: "present" as const, expectedLabel: "card.menuOnWebsite" },
  ])("renders bottom anchor with target/rel and the $expectedLabel label when type=$type and dayMenu=$dayMenu", ({ type, dayMenu, expectedLabel }) => {
    const r = makeRestaurant({ type, url: "https://example.com/x" })
    const menu = dayMenu === "present" ? makeMenu([{ title: "Dish", tags: [] }]) : undefined
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, dayIndex: 0 })
    expect(html).toContain('<a class="restaurant-website-link-text" href="https://example.com/x"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain(expectedLabel)
  })

  it("falls back to a span when restaurant has no url", () => {
    const r = makeRestaurant({ type: "full", url: "" })
    const html = renderRestaurantSection({ restaurant: r, dayMenu: undefined, voteCount: 0, userVoted: false, dayIndex: 0 })
    expect(html).toContain('<span class="restaurant-website-link-text">')
    expect(html).not.toContain('<a class="restaurant-website-link-text"')
  })

  it("places the bottom website link after the menu categories on menu-showing cards", () => {
    const r = makeRestaurant({ url: "https://example.com/baz" })
    const menu = makeMenu([{ title: "Schnitzel", tags: [] }])
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: 0, userVoted: false, dayIndex: 0 })
    expect(html.indexOf("restaurant-website-link-text")).toBeGreaterThan(html.indexOf("Schnitzel"))
  })

  it("includes the restaurant title in the bottom link's aria-label for screen readers", () => {
    const r = makeRestaurant({ type: "link", title: "Albasha", url: "https://example.com/a" })
    const html = renderRestaurantSection({ restaurant: r, dayMenu: undefined, voteCount: 0, userVoted: false, dayIndex: 0 })
    expect(html).toContain('aria-label="card.menuOnWebsite – Albasha"')
  })
})
