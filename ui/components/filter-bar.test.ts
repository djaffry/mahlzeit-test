import { describe, it, expect, beforeEach } from "vitest"
import {
  loadFilters,
  saveFilters,
  getActiveFilters,
  isFilterShowAll,
  itemMatchesFilters,
  buildFilterButtons,
  applyFilters,
} from "./filter-bar"

beforeEach(() => {
  // Reset module-level state: clear localStorage and reset activeFilters + _filterCount
  localStorage.clear()
  // loadFilters([]) → activeFilters cleared, nothing added; _filterCount stays as-is
  // Reset _filterCount to 0 by calling buildFilterButtons with empty array
  // (requires a #filters element in DOM)
  const existing = document.getElementById("filters")
  if (existing) existing.remove()
  const filtersEl = document.createElement("div")
  filtersEl.id = "filters"
  document.body.appendChild(filtersEl)
  buildFilterButtons([])
  loadFilters([])
})

/* ── loadFilters ────────────────────────────────────────── */

describe("loadFilters", () => {
  it("activates all tags when no localStorage data exists", () => {
    loadFilters(["Vegan", "Vegetarisch", "Fleisch"])
    const active = getActiveFilters()
    expect(active.has("Vegan")).toBe(true)
    expect(active.has("Vegetarisch")).toBe(true)
    expect(active.has("Fleisch")).toBe(true)
  })

  it("restores saved filters from localStorage", () => {
    const stored = JSON.stringify({
      active: ["Vegan"],
      known: ["Vegan", "Vegetarisch", "Fleisch"],
    })
    localStorage.setItem("dietary-filters", stored)

    loadFilters(["Vegan", "Vegetarisch", "Fleisch"])
    const active = getActiveFilters()

    expect(active.has("Vegan")).toBe(true)
    expect(active.has("Vegetarisch")).toBe(false)
    expect(active.has("Fleisch")).toBe(false)
  })

  it("activates new tags that were not in the previously known set", () => {
    // known set did not include "Glutenfrei", so it should be auto-activated
    const stored = JSON.stringify({
      active: ["Vegan"],
      known: ["Vegan", "Vegetarisch"],
    })
    localStorage.setItem("dietary-filters", stored)

    loadFilters(["Vegan", "Vegetarisch", "Glutenfrei"])
    const active = getActiveFilters()

    expect(active.has("Vegan")).toBe(true)
    expect(active.has("Glutenfrei")).toBe(true) // new tag — auto-activated
    expect(active.has("Vegetarisch")).toBe(false)
  })

  it("falls back to activating all tags when localStorage contains invalid JSON", () => {
    localStorage.setItem("dietary-filters", "not-json{{{")
    loadFilters(["Vegan", "Fleisch"])
    const active = getActiveFilters()
    expect(active.has("Vegan")).toBe(true)
    expect(active.has("Fleisch")).toBe(true)
  })
})

/* ── saveFilters ────────────────────────────────────────── */

describe("saveFilters", () => {
  it("persists active filters to localStorage", () => {
    // Build filter buttons so saveFilters can read them from DOM
    buildFilterButtons(["Vegan", "Fleisch"])
    loadFilters(["Vegan", "Fleisch"])

    saveFilters()

    const raw = localStorage.getItem("dietary-filters")
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.active).toContain("Vegan")
    expect(parsed.active).toContain("Fleisch")
  })
})

/* ── getActiveFilters ───────────────────────────────────── */

describe("getActiveFilters", () => {
  it("returns the current active filter set", () => {
    loadFilters(["Vegan", "Vegetarisch"])
    const filters = getActiveFilters()
    expect(filters).toBeInstanceOf(Set)
    expect(filters.size).toBe(2)
  })
})

/* ── isFilterShowAll ────────────────────────────────────── */

describe("isFilterShowAll", () => {
  it("returns true when all tags are active (show-all state)", () => {
    buildFilterButtons(["Vegan", "Fleisch"])
    loadFilters(["Vegan", "Fleisch"])
    // activeFilters.size === 2, _filterCount === 2
    expect(isFilterShowAll()).toBe(true)
  })

  it("returns false when only some tags are active", () => {
    buildFilterButtons(["Vegan", "Fleisch"])
    // Restore only one tag as active
    const stored = JSON.stringify({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    localStorage.setItem("dietary-filters", stored)
    loadFilters(["Vegan", "Fleisch"])
    // activeFilters.size === 1, _filterCount === 2
    expect(isFilterShowAll()).toBe(false)
  })
})

/* ── itemMatchesFilters ─────────────────────────────────── */

describe("itemMatchesFilters", () => {
  it("returns true for items with no tags (untagged items always shown)", () => {
    loadFilters([]) // no active filters
    expect(itemMatchesFilters({ tags: [] })).toBe(true)
  })

  it("returns true for items whose tag is active", () => {
    loadFilters(["Vegan"])
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(true)
  })

  it("returns false for items whose tag is not active", () => {
    const stored = JSON.stringify({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    localStorage.setItem("dietary-filters", stored)
    loadFilters(["Vegan", "Fleisch"])
    expect(itemMatchesFilters({ tags: ["Fleisch"] })).toBe(false)
  })
})

/* ── applyFilters ──────────────────────────────────────── */

function buildPanel(): HTMLElement {
  const panel = document.createElement("div")

  const card = document.createElement("div")
  card.className = "restaurant-card"

  const veganItem = document.createElement("div")
  veganItem.className = "menu-item"
  veganItem.dataset.tags = "vegan"

  const fleischItem = document.createElement("div")
  fleischItem.className = "menu-item"
  fleischItem.dataset.tags = "fleisch"

  const untaggedItem = document.createElement("div")
  untaggedItem.className = "menu-item"

  card.append(veganItem, fleischItem, untaggedItem)
  panel.appendChild(card)
  return panel
}

describe("applyFilters", () => {
  it("shows all items when all filters are active (show-all)", () => {
    buildFilterButtons(["Vegan", "Fleisch"])
    loadFilters(["Vegan", "Fleisch"])
    const panel = buildPanel()

    applyFilters(panel)

    const items = panel.querySelectorAll(".menu-item")
    items.forEach(el => expect(el.classList.contains("hidden")).toBe(false))
    expect(panel.querySelector(".restaurant-card")!.classList.contains("filter-collapsed")).toBe(false)
  })

  it("hides items whose tags are not in active filters", () => {
    buildFilterButtons(["Vegan", "Fleisch"])
    const stored = JSON.stringify({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    localStorage.setItem("dietary-filters", stored)
    loadFilters(["Vegan", "Fleisch"])
    const panel = buildPanel()

    applyFilters(panel)

    const items = panel.querySelectorAll<HTMLElement>(".menu-item")
    expect(items[0].classList.contains("hidden")).toBe(false)  // vegan — active
    expect(items[1].classList.contains("hidden")).toBe(true)   // fleisch — not active
    expect(items[2].classList.contains("hidden")).toBe(false)  // untagged — always shown
  })

  it("adds filter-collapsed to card when all items are hidden", () => {
    buildFilterButtons(["Vegan", "Fleisch"])
    const stored = JSON.stringify({ active: [], known: ["Vegan", "Fleisch"] })
    localStorage.setItem("dietary-filters", stored)
    loadFilters(["Vegan", "Fleisch"])

    const panel = document.createElement("div")
    const card = document.createElement("div")
    card.className = "restaurant-card"
    const item = document.createElement("div")
    item.className = "menu-item"
    item.dataset.tags = "vegan"
    card.appendChild(item)
    panel.appendChild(card)

    applyFilters(panel)

    expect(card.classList.contains("filter-collapsed")).toBe(true)
  })

  it("does nothing when panel is null", () => {
    expect(() => applyFilters(null)).not.toThrow()
  })
})
