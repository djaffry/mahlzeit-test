import { describe, it, expect } from "vitest"
import { renderRestaurant, renderLinkRestaurant, renderMapCardInGrid, renderDay } from "./restaurant-card"
import type { Restaurant } from "../types"

const baseRestaurant: Restaurant = {
  id: "test",
  title: "Test Restaurant",
  url: "https://example.com",
  type: "full",
  fetchedAt: "2026-03-20T10:00:00Z",
  error: null,
  days: {
    Montag: {
      categories: [
        {
          name: "Hauptspeise",
          items: [
            {
              title: "Schnitzel",
              description: null,
              price: "12,90 €",
              tags: ["Fleisch"],
              allergens: "A,C",
            },
          ],
        },
      ],
    },
  },
}

/* ── renderRestaurant ───────────────────────────────────── */

describe("renderRestaurant", () => {
  it("renders a card with the restaurant title", () => {
    const html = renderRestaurant(baseRestaurant, "Montag", new Set())
    expect(html).toContain("Test Restaurant")
  })

  it("shows error message when restaurant.error is set", () => {
    const restaurant: Restaurant = { ...baseRestaurant, error: "Fetch failed" }
    const html = renderRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("restaurant-error")
    expect(html).toContain("Fetch failed")
  })

  it("shows '(Noch) kein Menü' when no day data exists", () => {
    const restaurant: Restaurant = { ...baseRestaurant, days: {} }
    const html = renderRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("(Noch) kein Menü")
  })

  it("renders categories and items when day data exists", () => {
    const html = renderRestaurant(baseRestaurant, "Montag", new Set())
    expect(html).toContain("Hauptspeise")
    expect(html).toContain("Schnitzel")
    expect(html).toContain("12,90 €")
  })

  it("adds 'collapsed' class when id is in collapsedSet", () => {
    const collapsed = new Set(["test"])
    const html = renderRestaurant(baseRestaurant, "Montag", collapsed)
    expect(html).toContain("collapsed")
  })

  it("does not add 'collapsed' class when id is not in collapsedSet", () => {
    const html = renderRestaurant(baseRestaurant, "Montag", new Set())
    // The card element itself should not have "collapsed" in its class attribute
    // (map-card uses "map-collapsed", so we can check the data-restaurant card specifically)
    const cardMatch = html.match(/<div class="restaurant-card([^"]*)"/)
    expect(cardMatch?.[1] ?? "").not.toContain("collapsed")
  })

  it("shows edenred badge when edenred is true", () => {
    const restaurant: Restaurant = { ...baseRestaurant, edenred: true }
    const html = renderRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("edenred-badge")
    expect(html).toContain("Edenred")
  })

  it("shows stampCard badge when stampCard is true", () => {
    const restaurant: Restaurant = { ...baseRestaurant, stampCard: true }
    const html = renderRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("stamp-card-badge")
    expect(html).toContain("Stempelkarte")
  })

  it("shows outdoor badge when outdoor is true", () => {
    const restaurant: Restaurant = { ...baseRestaurant, outdoor: true }
    const html = renderRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("outdoor-badge")
    expect(html).toContain("Draußen")
  })
})

/* ── renderLinkRestaurant ───────────────────────────────── */

describe("renderLinkRestaurant", () => {
  const linkRestaurant: Restaurant = {
    ...baseRestaurant,
    type: "link",
    days: {},
  }

  it("renders a link card with website link", () => {
    const html = renderLinkRestaurant(linkRestaurant, "Montag", new Set())
    expect(html).toContain("Test Restaurant")
    expect(html).toContain("https://example.com")
    expect(html).toContain("Speisekarte auf der Website")
  })

  it("does not add 'link-muted' when restaurant is available on the day", () => {
    // No availableDays restriction means available every day
    const html = renderLinkRestaurant(linkRestaurant, "Montag", new Set())
    const cardMatch = html.match(/<div class="restaurant-card([^"]*)"/)
    expect(cardMatch?.[1] ?? "").not.toContain("link-muted")
  })

  it("adds 'link-muted' class when not available on the given day", () => {
    const restaurant: Restaurant = {
      ...linkRestaurant,
      availableDays: ["Dienstag", "Mittwoch"],
    }
    const html = renderLinkRestaurant(restaurant, "Montag", new Set())
    expect(html).toContain("link-muted")
  })
})

/* ── renderMapCardInGrid ────────────────────────────────── */

describe("renderMapCardInGrid", () => {
  it("renders map card without 'map-collapsed' when mapCollapsed is false", () => {
    const html = renderMapCardInGrid(false)
    expect(html).toContain("map-card")
    expect(html).not.toContain("map-collapsed")
  })

  it("renders map card with 'map-collapsed' class when mapCollapsed is true", () => {
    const html = renderMapCardInGrid(true)
    expect(html).toContain("map-collapsed")
  })
})

/* ── renderDay ──────────────────────────────────────────── */

describe("renderDay", () => {
  it("combines menu and link restaurants into the grid", () => {
    const menuRestaurant: Restaurant = { ...baseRestaurant, id: "menu-r", title: "Menu Place" }
    const linkRestaurant: Restaurant = {
      ...baseRestaurant,
      id: "link-r",
      title: "Link Place",
      type: "link",
      days: {},
    }

    const html = renderDay([menuRestaurant], [linkRestaurant], "Montag", new Set(), false)

    expect(html).toContain("restaurant-grid")
    expect(html).toContain("Menu Place")
    expect(html).toContain("Link Place")
    // Map card is always included
    expect(html).toContain("map-card")
  })
})
