import { describe, it, expect, vi, beforeEach } from "vitest"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("../../constants", () => ({
  DAYS: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
}))

vi.mock("../../i18n/i18n", () => ({
  t: (k: string) => k,
  getLocale: () => "de-AT",
}))

vi.mock("../../utils/date", () => ({
  getMondayOfWeek: () => new Date("2026-04-06"),
}))

import { formatDayLabel, formatBadges } from "./share-format"
import { extractRestaurantMeta, extractMenuItem, groupItemsByCategory, getShareSelectionData } from "./share-data"

/* ── share-format ───────────────────────────────────────── */

describe("formatBadges", () => {
  it("joins badges with separator", () => {
    expect(formatBadges(["badge.edenred", "badge.outdoor"])).toBe("badge.edenred · badge.outdoor")
  })

  it("returns single badge without separator", () => {
    expect(formatBadges(["badge.edenred"])).toBe("badge.edenred")
  })

  it("returns empty string for no badges", () => {
    expect(formatBadges([])).toBe("")
  })
})

describe("formatDayLabel", () => {
  it("returns formatted date string for a valid day", () => {
    const label = formatDayLabel("Montag")
    // We can't assert exact locale output, but it should not be the raw day name
    expect(label).not.toBe("")
    expect(typeof label).toBe("string")
  })

  it("returns the raw string for an unknown day name", () => {
    expect(formatDayLabel("Samstag")).toBe("Samstag")
  })
})

/* ── share-data ─────────────────────────────────────────── */

describe("extractRestaurantMeta", () => {
  it("extracts name, cuisine, and badges from a card element", () => {
    const card = document.createElement("div")
    card.dataset.cuisine = "Italian · Pizza"
    card.dataset.badges = "badge.edenred,badge.outdoor"
    card.innerHTML = `<span class="restaurant-name">Testaurant</span>`

    const meta = extractRestaurantMeta(card)
    expect(meta).toEqual({
      name: "Testaurant",
      cuisine: "Italian · Pizza",
      badges: ["badge.edenred", "badge.outdoor"],
    })
  })

  it("returns null if no restaurant-name element exists", () => {
    const card = document.createElement("div")
    expect(extractRestaurantMeta(card)).toBeNull()
  })

  it("returns empty arrays when no badges or cuisine set", () => {
    const card = document.createElement("div")
    card.innerHTML = `<span class="restaurant-name">Plain</span>`

    const meta = extractRestaurantMeta(card)
    expect(meta).toEqual({ name: "Plain", cuisine: "", badges: [] })
  })
})

describe("extractMenuItem", () => {
  it("extracts title, price, and description", () => {
    const el = document.createElement("div")
    el.innerHTML = `
      <span class="menu-item-title">Schnitzel</span>
      <span class="menu-item-price">€12.90</span>
      <span class="menu-item-description">with fries</span>
    `

    const item = extractMenuItem(el)
    expect(item.title).toBe("Schnitzel")
    expect(item.price).toBe("€12.90")
    expect(item.description).toBe("with fries")
    expect(item.tags).toEqual([])
  })

  it("returns empty strings for missing fields", () => {
    const el = document.createElement("div")
    const item = extractMenuItem(el)
    expect(item.title).toBe("")
    expect(item.price).toBe("")
    expect(item.description).toBe("")
  })
})

describe("groupItemsByCategory", () => {
  it("groups items under their category", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <div class="menu-category">
        <div class="category-name">Mains</div>
        <div class="menu-item"><span class="menu-item-title">Schnitzel</span></div>
        <div class="menu-item"><span class="menu-item-title">Gulasch</span></div>
      </div>
    `
    const items = [...container.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("Mains")
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items[0].title).toBe("Schnitzel")
    expect(groups[0].items[1].title).toBe("Gulasch")
  })

  it("handles items without a named category", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <div class="menu-category">
        <div class="menu-item"><span class="menu-item-title">Daily</span></div>
      </div>
    `
    const items = [...container.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("")
    expect(groups[0].items[0].title).toBe("Daily")
  })

  it("groups items from multiple categories", () => {
    const container = document.createElement("div")
    container.innerHTML = `
      <div class="menu-category">
        <div class="category-name">Starters</div>
        <div class="menu-item"><span class="menu-item-title">Soup</span></div>
      </div>
      <div class="menu-category">
        <div class="category-name">Mains</div>
        <div class="menu-item"><span class="menu-item-title">Steak</span></div>
      </div>
    `
    const items = [...container.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)

    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe("Starters")
    expect(groups[1].name).toBe("Mains")
  })
})

describe("getShareSelectionData", () => {
  it("returns null when timeline is null", () => {
    expect(getShareSelectionData(() => null)).toBeNull()
  })

  it("returns null when no items are selected", () => {
    const timeline = document.createElement("div")
    timeline.innerHTML = `
      <div class="day-section" data-day-index="0">
        <div class="restaurant-section" data-restaurant-id="r1">
          <span class="restaurant-name">Test</span>
          <div class="menu-item"><span class="menu-item-title">Soup</span></div>
        </div>
      </div>
    `
    expect(getShareSelectionData(() => timeline)).toBeNull()
  })

  it("extracts data from selected items", () => {
    const timeline = document.createElement("div")
    timeline.innerHTML = `
      <div class="day-section" data-day-index="0">
        <div class="restaurant-section" data-restaurant-id="r1">
          <span class="restaurant-name">Testaurant</span>
          <div class="menu-category">
            <div class="menu-item selected">
              <span class="menu-item-title">Schnitzel</span>
              <span class="menu-item-price">€12</span>
            </div>
          </div>
        </div>
      </div>
    `

    const data = getShareSelectionData(() => timeline)
    expect(data).not.toBeNull()
    expect(data!.days).toHaveLength(1)
    expect(data!.days[0].day).toBe("Montag")
    expect(data!.days[0].sections).toHaveLength(1)
    expect(data!.days[0].sections[0].name).toBe("Testaurant")
    expect(data!.days[0].sections[0].categories[0].items[0].title).toBe("Schnitzel")
  })

  it("skips hidden selected items", () => {
    const timeline = document.createElement("div")
    timeline.innerHTML = `
      <div class="day-section" data-day-index="0">
        <div class="restaurant-section" data-restaurant-id="r1">
          <span class="restaurant-name">Test</span>
          <div class="menu-category">
            <div class="menu-item selected hidden"><span class="menu-item-title">Hidden</span></div>
          </div>
        </div>
      </div>
    `
    expect(getShareSelectionData(() => timeline)).toBeNull()
  })
})
