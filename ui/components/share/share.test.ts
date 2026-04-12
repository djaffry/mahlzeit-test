import { describe, it, expect, beforeEach } from "vitest"
import { extractRestaurantMeta, extractMenuItem, groupItemsByCategory, getShareSelectionData } from "./share-data"

/* ── extractRestaurantMeta ──────────────────────────────── */

describe("extractRestaurantMeta", () => {
  it("extracts name, cuisine, and badges", () => {
    const card = document.createElement("div")
    card.dataset.cuisine = "Café · Bistro"
    card.dataset.badges = "badge.edenred"
    card.innerHTML = `<div class="restaurant-name">Mano Café</div>`
    const meta = extractRestaurantMeta(card)
    expect(meta).not.toBeNull()
    expect(meta!.name).toBe("Mano Café")
    expect(meta!.cuisine).toBe("Café · Bistro")
    expect(meta!.badges).toContain("badge.edenred")
  })

  it("returns null when restaurant-name element is missing", () => {
    const card = document.createElement("div")
    card.innerHTML = `<div class="some-other-element">Content</div>`
    expect(extractRestaurantMeta(card)).toBeNull()
  })

  it("handles card with no cuisine or badges", () => {
    const card = document.createElement("div")
    card.innerHTML = `<div class="restaurant-name">Plain Restaurant</div>`
    const meta = extractRestaurantMeta(card)
    expect(meta).not.toBeNull()
    expect(meta!.name).toBe("Plain Restaurant")
    expect(meta!.cuisine).toBe("")
    expect(meta!.badges).toHaveLength(0)
  })

  it("extracts outdoor and stamp-card badges", () => {
    const card = document.createElement("div")
    card.dataset.badges = "badge.outdoor,badge.stampCard"
    card.innerHTML = `<div class="restaurant-name">Zum Wirt</div>`
    const meta = extractRestaurantMeta(card)
    expect(meta!.badges).toContain("badge.outdoor")
    expect(meta!.badges).toContain("badge.stampCard")
  })

  it("trims whitespace from name", () => {
    const card = document.createElement("div")
    card.innerHTML = `<div class="restaurant-name">  Spacey Name  </div>`
    const meta = extractRestaurantMeta(card)
    expect(meta!.name).toBe("Spacey Name")
  })
})

/* ── extractMenuItem ────────────────────────────────────── */

describe("extractMenuItem", () => {
  it("extracts title, price, description, and tags from item element", () => {
    const item = document.createElement("div")
    item.innerHTML = `
      <span class="menu-item-title">Wiener Schnitzel</span>
      <span class="menu-item-price">€ 12,90</span>
      <span class="menu-item-description">Mit Petersilkartoffeln und Preiselbeeren</span>
      <span class="menu-item-tags">
        <span class="tag-pill">Fleisch</span>
        <span class="tag-pill">Glutenfrei</span>
      </span>`
    const result = extractMenuItem(item)
    expect(result.title).toBe("Wiener Schnitzel")
    expect(result.price).toBe("€ 12,90")
    expect(result.description).toBe("Mit Petersilkartoffeln und Preiselbeeren")
    expect(result.tags).toHaveLength(2)
    expect(result.tags[0].label).toBe("Fleisch")
    expect(result.tags[1].label).toBe("Glutenfrei")
  })

  it("returns empty strings and empty tags when sub-elements are absent", () => {
    const item = document.createElement("div")
    const result = extractMenuItem(item)
    expect(result.title).toBe("")
    expect(result.price).toBe("")
    expect(result.description).toBe("")
    expect(result.tags).toHaveLength(0)
  })

  it("extracts title only when price and description are absent", () => {
    const item = document.createElement("div")
    item.innerHTML = `<span class="menu-item-title">Tagessuppe</span>`
    const result = extractMenuItem(item)
    expect(result.title).toBe("Tagessuppe")
    expect(result.price).toBe("")
    expect(result.description).toBe("")
    expect(result.tags).toHaveLength(0)
  })
})

/* ── groupItemsByCategory ───────────────────────────────── */

describe("groupItemsByCategory", () => {
  it("groups items from the same category together", () => {
    const panel = document.createElement("div")
    panel.innerHTML = `
      <div class="menu-category">
        <div class="category-name">Mittagsmenü</div>
        <div class="menu-item"><span class="menu-item-title">Gulasch</span></div>
        <div class="menu-item"><span class="menu-item-title">Tafelspitz</span></div>
      </div>`
    const items = [...panel.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("Mittagsmenü")
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items[0].title).toBe("Gulasch")
    expect(groups[0].items[1].title).toBe("Tafelspitz")
  })

  it("groups items from different categories into separate groups", () => {
    const panel = document.createElement("div")
    panel.innerHTML = `
      <div class="menu-category">
        <div class="category-name">Vorspeise</div>
        <div class="menu-item"><span class="menu-item-title">Suppe</span></div>
      </div>
      <div class="menu-category">
        <div class="category-name">Hauptspeise</div>
        <div class="menu-item"><span class="menu-item-title">Schnitzel</span></div>
      </div>`
    const items = [...panel.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe("Vorspeise")
    expect(groups[1].name).toBe("Hauptspeise")
  })

  it("handles items with no parent .category element (empty category name)", () => {
    const item = document.createElement("div")
    item.innerHTML = `<span class="menu-item-title">Orphan Item</span>`
    const groups = groupItemsByCategory([item])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("")
    expect(groups[0].items[0].title).toBe("Orphan Item")
  })
})

/* ── getShareSelectionData ──────────────────────────────── */

describe("getShareSelectionData", () => {
  let timeline: HTMLElement

  function wrapInDay(html: string, dayIndex = 0): string {
    return `<div class="day-section" data-day-index="${dayIndex}">${html}</div>`
  }

  beforeEach(() => {
    timeline = document.createElement("div")
  })

  it("returns null when nothing is selected", () => {
    timeline.innerHTML = wrapInDay(`
      <div class="restaurant-section" data-restaurant-id="cafe-a">
        <div class="restaurant-name">Cafe A</div>
        <div class="menu-category">
          <div class="category-name">Menü</div>
          <div class="menu-item"><span class="menu-item-title">Pasta</span></div>
        </div>
      </div>`)
    const result = getShareSelectionData(() => timeline)
    expect(result).toBeNull()
  })

  it("returns null when timeline getter returns null", () => {
    const result = getShareSelectionData(() => null)
    expect(result).toBeNull()
  })

  it("extracts selected items grouped by restaurant and day", () => {
    timeline.innerHTML = wrapInDay(`
      <div class="restaurant-section" data-restaurant-id="bistro-x" data-cuisine="Österreichisch">
        <div class="restaurant-name">Bistro X</div>
        <div class="menu-category">
          <div class="category-name">Tagesmenü</div>
          <div class="menu-item selected">
            <span class="menu-item-title">Zwiebelrostbraten</span>
            <span class="menu-item-price">€ 14,50</span>
          </div>
          <div class="menu-item">
            <span class="menu-item-title">Not Selected</span>
          </div>
        </div>
      </div>`)
    const result = getShareSelectionData(() => timeline)
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(1)
    expect(result!.days[0].day).toBe("Montag")
    expect(result!.days[0].sections).toHaveLength(1)
    expect(result!.days[0].sections[0].name).toBe("Bistro X")
    expect(result!.days[0].sections[0].cuisine).toBe("Österreichisch")
    expect(result!.days[0].sections[0].restaurant).toBe("bistro-x")
    expect(result!.days[0].sections[0].categories).toHaveLength(1)
    expect(result!.days[0].sections[0].categories[0].items).toHaveLength(1)
    expect(result!.days[0].sections[0].categories[0].items[0].title).toBe("Zwiebelrostbraten")
  })

  it("groups selected items across multiple restaurants in same day", () => {
    timeline.innerHTML = wrapInDay(`
      <div class="restaurant-section" data-restaurant-id="restaurant-a">
        <div class="restaurant-name">Restaurant A</div>
        <div class="menu-category">
          <div class="category-name">Menü</div>
          <div class="menu-item selected">
            <span class="menu-item-title">Item A</span>
          </div>
        </div>
      </div>
      <div class="restaurant-section" data-restaurant-id="restaurant-b">
        <div class="restaurant-name">Restaurant B</div>
        <div class="menu-category">
          <div class="category-name">Menü</div>
          <div class="menu-item selected">
            <span class="menu-item-title">Item B</span>
          </div>
        </div>
      </div>`)
    const result = getShareSelectionData(() => timeline)
    expect(result).not.toBeNull()
    expect(result!.days[0].sections).toHaveLength(2)
    expect(result!.days[0].sections[0].restaurant).toBe("restaurant-a")
    expect(result!.days[0].sections[1].restaurant).toBe("restaurant-b")
  })

  it("groups selections across multiple days", () => {
    timeline.innerHTML =
      wrapInDay(`
        <div class="restaurant-section" data-restaurant-id="place-a">
          <div class="restaurant-name">Place A</div>
          <div class="menu-category"><div class="menu-item selected"><span class="menu-item-title">Monday Item</span></div></div>
        </div>`, 0) +
      wrapInDay(`
        <div class="restaurant-section" data-restaurant-id="place-b">
          <div class="restaurant-name">Place B</div>
          <div class="menu-category"><div class="menu-item selected"><span class="menu-item-title">Tuesday Item</span></div></div>
        </div>`, 1)
    const result = getShareSelectionData(() => timeline)
    expect(result).not.toBeNull()
    expect(result!.days).toHaveLength(2)
    expect(result!.days[0].day).toBe("Montag")
    expect(result!.days[1].day).toBe("Dienstag")
    expect(result!.days[0].sections[0].restaurant).toBe("place-a")
    expect(result!.days[1].sections[0].restaurant).toBe("place-b")
  })

  it("skips hidden items when collecting selected items", () => {
    timeline.innerHTML = wrapInDay(`
      <div class="restaurant-section" data-restaurant-id="cafe-z">
        <div class="restaurant-name">Cafe Z</div>
        <div class="menu-category">
          <div class="category-name">Menü</div>
          <div class="menu-item selected hidden">
            <span class="menu-item-title">Hidden Selected</span>
          </div>
          <div class="menu-item selected">
            <span class="menu-item-title">Visible Selected</span>
          </div>
        </div>
      </div>`)
    const result = getShareSelectionData(() => timeline)
    expect(result).not.toBeNull()
    expect(result!.days[0].sections[0].categories[0].items).toHaveLength(1)
    expect(result!.days[0].sections[0].categories[0].items[0].title).toBe("Visible Selected")
  })
})
