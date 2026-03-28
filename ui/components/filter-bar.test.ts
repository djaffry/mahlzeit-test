import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  loadFilters,
  saveFilters,
  getActiveFilters,
  isFilterShowAll,
  itemMatchesFilters,
  buildFilterButtons,
  applyFilters,
  setupFilterListeners,
} from "./filter-bar"
import { loadHierarchy } from "../utils/tag-utils"

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
    loadFilters([])
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

/* ── itemMatchesFilters with hierarchy ─────────────────── */

describe("itemMatchesFilters (hierarchy)", () => {
  const ALL_TAGS = ["Vegetarisch", "Vegan", "Glutenfrei", "Fleisch", "Geflügel", "Huhn"]
  const HIERARCHY = {
    Fleisch: ["Geflügel"],
    Geflügel: ["Huhn"],
    Vegetarisch: ["Vegan"],
  }

  beforeEach(() => {
    loadHierarchy(HIERARCHY)
    buildFilterButtons(ALL_TAGS)
  })

  afterEach(() => {
    // Reset hierarchy so other tests aren't affected
    loadHierarchy({})
  })

  function activateOnly(tags: string[]): void {
    localStorage.setItem("dietary-filters", JSON.stringify({ active: tags, known: ALL_TAGS }))
    loadFilters(ALL_TAGS)
  }

  it("parent active expands to include children", () => {
    activateOnly(["Fleisch", "Geflügel", "Huhn"])
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
  })

  it("parent active alone expands to match child-tagged items", () => {
    // Fleisch active → expands to include Geflügel, Huhn
    activateOnly(["Fleisch"])
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
    expect(itemMatchesFilters({ tags: ["Geflügel"] })).toBe(true)
  })

  it("child active without parent still matches", () => {
    activateOnly(["Huhn"])
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
  })

  it("multi-tag item matches if any tag is active", () => {
    // Vegetarisch not active, but Glutenfrei is
    activateOnly(["Glutenfrei"])
    expect(itemMatchesFilters({ tags: ["Vegetarisch", "Glutenfrei"] })).toBe(true)
  })

  it("item with only active tags is shown", () => {
    activateOnly(["Glutenfrei", "Vegetarisch", "Vegan"])
    expect(itemMatchesFilters({ tags: ["Vegetarisch", "Glutenfrei"] })).toBe(true)
  })

  it("untagged items always shown regardless of filter state", () => {
    activateOnly([])
    expect(itemMatchesFilters({ tags: [] })).toBe(true)
    expect(itemMatchesFilters({})).toBe(true)
  })

  it("all filters active shows everything", () => {
    activateOnly(ALL_TAGS)
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
    expect(itemMatchesFilters({ tags: ["Vegetarisch", "Glutenfrei"] })).toBe(true)
  })

  it("disabling all filters hides all tagged items", () => {
    activateOnly([])
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(false)
    expect(itemMatchesFilters({ tags: ["Fleisch"] })).toBe(false)
  })

  it("Vegetarisch active expands to include Vegan", () => {
    activateOnly(["Vegetarisch"])
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(true)
  })

  it("item with no matching active tags is hidden", () => {
    activateOnly(["Glutenfrei"])
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(false)
  })

  it("item with unknown tag not in hierarchy is hidden", () => {
    activateOnly(ALL_TAGS)
    expect(itemMatchesFilters({ tags: ["Nüsse"] })).toBe(false)
  })

  it("item with mix of known active tag and unknown tag is shown", () => {
    activateOnly(ALL_TAGS)
    expect(itemMatchesFilters({ tags: ["Vegan", "Nüsse"] })).toBe(true)
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

/* ── Cascading toggles ─────────────────────────────────── */

describe("cascading toggles", () => {
  const ALL_TAGS = ["Vegetarisch", "Vegan", "Fleisch", "Geflügel", "Huhn", "Pute", "Lamm"]
  const HIERARCHY = {
    Fleisch: ["Geflügel", "Lamm"],
    Geflügel: ["Huhn", "Pute"],
    Vegetarisch: ["Vegan"],
  }

  let filtersEl: HTMLElement
  let changeCount: number

  beforeEach(() => {
    loadHierarchy(HIERARCHY)
    filtersEl = document.getElementById("filters")!
    loadFilters(ALL_TAGS)
    buildFilterButtons(ALL_TAGS)
    changeCount = 0
    setupFilterListeners(filtersEl, () => { changeCount++ })
  })

  afterEach(() => {
    loadHierarchy({})
  })

  function clickFilter(tag: string): void {
    const btn = filtersEl.querySelector<HTMLElement>(`.filter-btn[data-filter="${tag}"]`)
    btn!.click()
  }

  function isActive(tag: string): boolean {
    return getActiveFilters().has(tag)
  }

  function btnIsActive(tag: string): boolean {
    return filtersEl.querySelector<HTMLElement>(`.filter-btn[data-filter="${tag}"]`)!.classList.contains("active")
  }

  it("toggling parent OFF cascades to all descendants", () => {
    clickFilter("Fleisch")
    expect(isActive("Fleisch")).toBe(false)
    expect(isActive("Geflügel")).toBe(false)
    expect(isActive("Huhn")).toBe(false)
    expect(isActive("Pute")).toBe(false)
    expect(isActive("Lamm")).toBe(false)
    // Unrelated tags unaffected
    expect(isActive("Vegetarisch")).toBe(true)
    expect(isActive("Vegan")).toBe(true)
  })

  it("toggling parent ON cascades to all descendants", () => {
    // First turn off, then back on
    clickFilter("Fleisch")
    clickFilter("Fleisch")
    expect(isActive("Fleisch")).toBe(true)
    expect(isActive("Geflügel")).toBe(true)
    expect(isActive("Huhn")).toBe(true)
    expect(isActive("Pute")).toBe(true)
    expect(isActive("Lamm")).toBe(true)
  })

  it("toggling mid-level parent cascades only to its subtree", () => {
    clickFilter("Geflügel")
    expect(isActive("Geflügel")).toBe(false)
    expect(isActive("Huhn")).toBe(false)
    expect(isActive("Pute")).toBe(false)
    // Parent and siblings unaffected
    expect(isActive("Fleisch")).toBe(true)
    expect(isActive("Lamm")).toBe(true)
  })

  it("toggling leaf tag only affects itself", () => {
    clickFilter("Huhn")
    expect(isActive("Huhn")).toBe(false)
    expect(isActive("Geflügel")).toBe(true)
    expect(isActive("Pute")).toBe(true)
    expect(isActive("Fleisch")).toBe(true)
  })

  it("individual child toggle after parent cascade works", () => {
    // Turn off all meat
    clickFilter("Fleisch")
    // Turn Lamm back on individually
    clickFilter("Lamm")
    expect(isActive("Fleisch")).toBe(false)
    expect(isActive("Geflügel")).toBe(false)
    expect(isActive("Huhn")).toBe(false)
    expect(isActive("Lamm")).toBe(true)
  })

  it("button visuals sync with cascaded state", () => {
    clickFilter("Fleisch")
    expect(btnIsActive("Fleisch")).toBe(false)
    expect(btnIsActive("Geflügel")).toBe(false)
    expect(btnIsActive("Huhn")).toBe(false)
    expect(btnIsActive("Pute")).toBe(false)
    expect(btnIsActive("Lamm")).toBe(false)
    // Unrelated buttons stay active
    expect(btnIsActive("Vegetarisch")).toBe(true)
  })

  it("onFilterChange fires once per click (not per cascaded tag)", () => {
    clickFilter("Fleisch")
    expect(changeCount).toBe(1)
  })

  it("cascade + matching: root OFF hides all descendant-tagged items", () => {
    clickFilter("Fleisch")
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(false)
    expect(itemMatchesFilters({ tags: ["Lamm"] })).toBe(false)
    expect(itemMatchesFilters({ tags: ["Fleisch"] })).toBe(false)
    // Unrelated tags still work
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(true)
  })

  it("cascade + matching: root ON restores all descendant-tagged items", () => {
    clickFilter("Fleisch")
    clickFilter("Fleisch")
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
    expect(itemMatchesFilters({ tags: ["Lamm"] })).toBe(true)
  })

  it("cascade + matching: mid-level OFF still shows child via grandparent expansion", () => {
    // Geflügel OFF cascades Huhn/Pute OFF, but Fleisch is still active
    // expandFilters(Fleisch) → includes Geflügel → Huhn, so Huhn still matches
    clickFilter("Geflügel")
    expect(itemMatchesFilters({ tags: ["Huhn"] })).toBe(true)
  })
})
