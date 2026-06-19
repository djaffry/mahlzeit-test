import { describe, it, expect, vi } from "vitest"
import type { Restaurant, DayMenu } from "../../types"

/* ── Mocks ────────────────────────────────────────────────── */

vi.mock("./restaurant-section.css", () => ({}))
vi.mock("../favorites/favorites.css", () => ({}))
vi.mock("../../icons", () => ({
  icons: { externalLink: "<svg>ext</svg>", mapPin: "<svg>pin</svg>", pin: "<svg>thumbtack</svg>" },
  restaurantIconSpan: (icon?: string) => `<span class="restaurant-icon">${icon ?? "utensils"}</span>`,
}))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("../../utils/date", () => ({
  isAvailableOnDay: () => true,
  formatAvailableDays: () => "Mon-Fri",
  isRestaurantFresh: () => true,
  getRestaurantLastUpdated: () => null,
}))
vi.mock("../../archive/archive", () => ({ isArchiveMode: () => false }))
vi.mock("../../constants", () => ({
  BADGES: [{ prop: "edenred", i18n: "badge.edenred", cssVar: "--tag-red" }],
  INFORMATIVE_TAGS: new Set(["Glutenfrei", "Laktosefrei"]),
}))
vi.mock("../menu-item/menu-item", () => ({
  renderItem: (item: { title: string }) => `<div class="menu-item">${item.title}</div>`,
}))

import { renderRestaurantSection } from "./restaurant-section"

/* ── Helpers ──────────────────────────────────────────────── */

function r(overrides: Partial<Restaurant> = {}): Restaurant {
  return { id: "r1", title: "Test", url: "https://example.com", type: "full", fetchedAt: "2026-04-07T10:00:00Z", error: null, days: {}, ...overrides }
}

function menu(items: (string | { title: string; tags: string[] })[]): DayMenu {
  return {
    categories: [{
      name: "Main",
      items: items.map(i => {
        const { title, tags } = typeof i === "string" ? { title: i, tags: [] } : i
        return { title, tags, description: null, price: null, allergens: null }
      }),
    }],
    fetchedAt: "2026-04-07T10:00:00Z",
  }
}

function render(opts: Partial<Parameters<typeof renderRestaurantSection>[0]> = {}) {
  return renderRestaurantSection({ restaurant: r(), dayMenu: undefined, dayIndex: 0, ...opts })
}

/* ── Tests ────────────────────────────────────────────────── */

describe("renderRestaurantSection", () => {
  it("renders all items when filters is null", () => {
    const html = render({ dayMenu: menu([{ title: "Schnitzel", tags: ["meat"] }, { title: "Salad", tags: ["vegan"] }]), filters: null })
    expect(html).toContain("Schnitzel")
    expect(html).toContain("Salad")
  })

  it("filters items by tag", () => {
    const html = render({ dayMenu: menu([{ title: "Schnitzel", tags: ["meat"] }, { title: "Salad", tags: ["vegan"] }]), filters: new Set(["vegan"]) })
    expect(html).not.toContain("Schnitzel")
    expect(html).toContain("Salad")
  })

  it("shows items with no tags regardless of filter", () => {
    const html = render({ dayMenu: menu(["Daily Special", { title: "Steak", tags: ["meat"] }]), filters: new Set(["vegan"]) })
    expect(html).toContain("Daily Special")
    expect(html).not.toContain("Steak")
  })

  it("returns empty string when all items are filtered out", () => {
    const html = render({ dayMenu: menu([{ title: "Steak", tags: ["meat"] }]), filters: new Set(["vegan"]) })
    expect(html).toBe("")
  })

  it("renders pin button (unpinned)", () => {
    const html = render({ dayMenu: menu(["Dish"]), isPinned: false })
    expect(html).toContain('class="pin-btn"')
    expect(html).not.toContain("pin-btn pinned")
  })

  it("renders pin button (pinned)", () => {
    const html = render({ dayMenu: menu(["Dish"]), isPinned: true })
    expect(html).toContain("pin-btn pinned")
  })

  it("renders pin button on link cards", () => {
    const html = render({ restaurant: r({ type: "link" }) })
    expect(html).toContain("pin-btn")
  })

  it("does not render old header icon link button", () => {
    const html = render({ dayMenu: menu(["Dish"]) })
    expect(html).not.toContain('class="restaurant-website-link"')
  })

  it.each([
    { type: "link" as const, hasMenu: false, expectedLabel: "card.menuOnWebsite" },
    { type: "full" as const, hasMenu: false, expectedLabel: "card.noMenu" },
    { type: "full" as const, hasMenu: true, expectedLabel: "card.menuOnWebsite" },
    { type: "specials" as const, hasMenu: false, expectedLabel: "card.noMenu" },
    { type: "specials" as const, hasMenu: true, expectedLabel: "card.menuOnWebsiteSpecials" },
  ])("renders bottom link with $expectedLabel (type=$type, hasMenu=$hasMenu)", ({ type, hasMenu, expectedLabel }) => {
    const html = render({ restaurant: r({ type, url: "https://example.com/x" }), dayMenu: hasMenu ? menu(["Dish"]) : undefined })
    expect(html).toContain('<a class="restaurant-website-link-text" href="https://example.com/x"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain(expectedLabel)
  })

  it("falls back to span when no url", () => {
    const html = render({ restaurant: r({ url: "" }) })
    expect(html).toContain('<span class="restaurant-website-link-text">')
    expect(html).not.toContain('<a class="restaurant-website-link-text"')
  })

  it("places website link after menu content", () => {
    const html = render({ restaurant: r({ url: "https://example.com/baz" }), dayMenu: menu(["Schnitzel"]) })
    expect(html.indexOf("restaurant-website-link-text")).toBeGreaterThan(html.indexOf("Schnitzel"))
  })

  it("includes title in link aria-label", () => {
    const html = render({ restaurant: r({ type: "link", title: "Albasha", url: "https://example.com/a" }) })
    expect(html).toContain('aria-label="card.menuOnWebsite – Albasha"')
  })
})
