import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractRestaurantMeta, extractMenuItem, groupItemsByCategory, getShareSelectionData } from "./share"

// share.ts imports a CSS file — mock it so vitest doesn't choke on it
vi.mock("../styles/share.css", () => ({}))

/* ── extractRestaurantMeta ──────────────────────────────── */

describe("extractRestaurantMeta", () => {
  it("extracts name, cuisine, and badges", () => {
    const card = document.createElement("div")
    card.innerHTML = `
      <div class="restaurant-name">Mano Café
        <span class="cuisine-tag">Café · Bistro</span>
        <span class="edenred-badge">Edenred</span>
      </div>`
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
    card.innerHTML = `
      <div class="restaurant-name">Zum Wirt
        <span class="outdoor-badge">Draußen</span>
        <span class="stamp-card-badge">Stempelkarte</span>
      </div>`
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
      <span class="item-title-text">Wiener Schnitzel</span>
      <span class="item-price">€ 12,90</span>
      <span class="item-description">Mit Petersilkartoffeln und Preiselbeeren</span>
      <span class="tag">Fleisch</span>
      <span class="tag">Glutenfrei</span>`
    const result = extractMenuItem(item)
    expect(result.title).toBe("Wiener Schnitzel")
    expect(result.price).toBe("€ 12,90")
    expect(result.description).toBe("Mit Petersilkartoffeln und Preiselbeeren")
    expect(result.tags).toEqual(["Fleisch", "Glutenfrei"])
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
    item.innerHTML = `<span class="item-title-text">Tagessuppe</span>`
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
      <div class="category">
        <div class="category-title">Mittagsmenü</div>
        <div class="menu-item"><span class="item-title-text">Gulasch</span></div>
        <div class="menu-item"><span class="item-title-text">Tafelspitz</span></div>
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
      <div class="category">
        <div class="category-title">Vorspeise</div>
        <div class="menu-item"><span class="item-title-text">Suppe</span></div>
      </div>
      <div class="category">
        <div class="category-title">Hauptspeise</div>
        <div class="menu-item"><span class="item-title-text">Schnitzel</span></div>
      </div>`
    const items = [...panel.querySelectorAll<HTMLElement>(".menu-item")]
    const groups = groupItemsByCategory(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].name).toBe("Vorspeise")
    expect(groups[1].name).toBe("Hauptspeise")
  })

  it("handles items with no parent .category element (empty category name)", () => {
    const item = document.createElement("div")
    item.innerHTML = `<span class="item-title-text">Orphan Item</span>`
    const groups = groupItemsByCategory([item])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe("")
    expect(groups[0].items[0].title).toBe("Orphan Item")
  })
})

/* ── getShareSelectionData ──────────────────────────────── */

describe("getShareSelectionData", () => {
  let panel: HTMLElement

  beforeEach(() => {
    panel = document.createElement("div")
    panel.dataset.panel = "Montag"
  })

  it("returns null when nothing is selected", () => {
    panel.innerHTML = `
      <div class="restaurant-card" data-restaurant="cafe-a">
        <div class="restaurant-name">Cafe A</div>
        <div class="category">
          <div class="category-title">Menü</div>
          <div class="menu-item"><span class="item-title-text">Pasta</span></div>
        </div>
      </div>`
    const result = getShareSelectionData(() => panel)
    expect(result).toBeNull()
  })

  it("returns null when panel getter returns null", () => {
    const result = getShareSelectionData(() => null)
    expect(result).toBeNull()
  })

  it("extracts selected items grouped by restaurant", () => {
    panel.innerHTML = `
      <div class="restaurant-card" data-restaurant="bistro-x">
        <div class="restaurant-name">Bistro X
          <span class="cuisine-tag">Österreichisch</span>
        </div>
        <div class="category">
          <div class="category-title">Tagesmenü</div>
          <div class="menu-item share-selected">
            <span class="item-title-text">Zwiebelrostbraten</span>
            <span class="item-price">€ 14,50</span>
          </div>
          <div class="menu-item">
            <span class="item-title-text">Not Selected</span>
          </div>
        </div>
      </div>`
    const result = getShareSelectionData(() => panel)
    expect(result).not.toBeNull()
    expect(result!.day).toBe("Montag")
    expect(result!.sections).toHaveLength(1)
    expect(result!.sections[0].name).toBe("Bistro X")
    expect(result!.sections[0].cuisine).toBe("Österreichisch")
    expect(result!.sections[0].restaurant).toBe("bistro-x")
    expect(result!.sections[0].categories).toHaveLength(1)
    expect(result!.sections[0].categories[0].items).toHaveLength(1)
    expect(result!.sections[0].categories[0].items[0].title).toBe("Zwiebelrostbraten")
  })

  it("groups selected items across multiple restaurants", () => {
    panel.innerHTML = `
      <div class="restaurant-card" data-restaurant="restaurant-a">
        <div class="restaurant-name">Restaurant A</div>
        <div class="category">
          <div class="category-title">Menü</div>
          <div class="menu-item share-selected">
            <span class="item-title-text">Item A</span>
          </div>
        </div>
      </div>
      <div class="restaurant-card" data-restaurant="restaurant-b">
        <div class="restaurant-name">Restaurant B</div>
        <div class="category">
          <div class="category-title">Menü</div>
          <div class="menu-item share-selected">
            <span class="item-title-text">Item B</span>
          </div>
        </div>
      </div>`
    const result = getShareSelectionData(() => panel)
    expect(result).not.toBeNull()
    expect(result!.sections).toHaveLength(2)
    expect(result!.sections[0].restaurant).toBe("restaurant-a")
    expect(result!.sections[1].restaurant).toBe("restaurant-b")
  })

  it("includes link-only cards that are share-selected (with empty categories)", () => {
    panel.innerHTML = `
      <div class="restaurant-card share-selected" data-restaurant="link-only">
        <div class="restaurant-name">Link-Only Place
          <span class="edenred-badge">Edenred</span>
        </div>
      </div>`
    const result = getShareSelectionData(() => panel)
    expect(result).not.toBeNull()
    expect(result!.sections).toHaveLength(1)
    expect(result!.sections[0].restaurant).toBe("link-only")
    expect(result!.sections[0].name).toBe("Link-Only Place")
    expect(result!.sections[0].categories).toHaveLength(0)
    expect(result!.sections[0].badges).toContain("badge.edenred")
  })

  it("skips hidden items when collecting selected items", () => {
    panel.innerHTML = `
      <div class="restaurant-card" data-restaurant="cafe-z">
        <div class="restaurant-name">Cafe Z</div>
        <div class="category">
          <div class="category-title">Menü</div>
          <div class="menu-item share-selected hidden">
            <span class="item-title-text">Hidden Selected</span>
          </div>
          <div class="menu-item share-selected">
            <span class="item-title-text">Visible Selected</span>
          </div>
        </div>
      </div>`
    const result = getShareSelectionData(() => panel)
    expect(result).not.toBeNull()
    expect(result!.sections[0].categories[0].items).toHaveLength(1)
    expect(result!.sections[0].categories[0].items[0].title).toBe("Visible Selected")
  })
})
