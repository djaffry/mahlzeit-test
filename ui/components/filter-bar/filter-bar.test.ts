import { describe, it, expect, vi, beforeEach } from "vitest"

/* ── Mock tag-utils (no hierarchy loaded) ──────────────── */

vi.mock("../../utils/tag-utils", () => ({
  getTagColor: () => "--fg-muted",
  expandFilters: (s: Set<string>) => new Set(s),
  getDescendants: (tag: string) => new Set([tag]),
  isLoaded: () => false,
}))

vi.mock("../../utils/haptic", () => ({ haptic: vi.fn() }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../icons", () => ({ icons: { x: "" } }))
vi.mock("../overlay", () => ({ openOverlay: vi.fn() }))

import {
  loadFilters,
  saveFilters,
  isFilterShowAll,
  getEffectiveFilters,
  itemMatchesFilters,
} from "./filter-bar"

/* ── Helpers ───────────────────────────────────────────── */

function setupLocalStorage(data?: { active: string[]; known: string[] }): void {
  if (data) {
    localStorage.setItem("dietary-filters", JSON.stringify(data))
  } else {
    localStorage.removeItem("dietary-filters")
  }
}

/* ── Tests ─────────────────────────────────────────────── */

beforeEach(() => {
  localStorage.clear()
})

describe("loadFilters", () => {
  it("activates all tags when no localStorage entry exists", () => {
    loadFilters(["Vegan", "Glutenfrei", "Laktosefrei"])
    expect(isFilterShowAll()).toBe(true)
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan", "Glutenfrei", "Laktosefrei"]))
  })

  it("restores previously active filters from localStorage", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Glutenfrei"] })
    loadFilters(["Vegan", "Glutenfrei"])
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan"]))
    expect(isFilterShowAll()).toBe(false)
  })

  it("auto-activates new tags not in known set", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Glutenfrei"] })
    loadFilters(["Vegan", "Glutenfrei", "Bio"])
    const effective = getEffectiveFilters()
    expect(effective.has("Vegan")).toBe(true)
    expect(effective.has("Bio")).toBe(true)
    expect(effective.has("Glutenfrei")).toBe(false)
  })

  it("ignores stored active filters not in available tags", () => {
    setupLocalStorage({ active: ["Removed"], known: ["Removed"] })
    loadFilters(["Vegan"])
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan"]))
  })
})

describe("saveFilters", () => {
  it("persists current active filters to localStorage", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Glutenfrei"] })
    loadFilters(["Vegan", "Glutenfrei"])
    saveFilters()
    const stored = JSON.parse(localStorage.getItem("dietary-filters")!)
    expect(stored.active).toEqual(["Vegan"])
    expect(stored.known).toEqual(["Vegan", "Glutenfrei"])
  })

  it("invalidates effective caches", () => {
    loadFilters(["A", "B"])
    const first = getEffectiveFilters()
    saveFilters()
    const second = getEffectiveFilters()
    // Cache was invalidated, so these are different Set instances
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})

describe("getEffectiveFilters", () => {
  it("returns cached set on repeated calls", () => {
    loadFilters(["Vegan", "Glutenfrei"])
    const a = getEffectiveFilters()
    const b = getEffectiveFilters()
    expect(a).toBe(b) // same reference = cached
  })
})

describe("itemMatchesFilters", () => {
  it("returns true when item has no tags", () => {
    loadFilters(["Vegan"])
    expect(itemMatchesFilters({})).toBe(true)
    expect(itemMatchesFilters({ tags: [] })).toBe(true)
  })

  it("returns true when item has a matching tag", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Glutenfrei"] })
    loadFilters(["Vegan", "Glutenfrei"])
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(true)
  })

  it("returns false when item has no matching tags", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Glutenfrei"] })
    loadFilters(["Vegan", "Glutenfrei"])
    expect(itemMatchesFilters({ tags: ["Glutenfrei"] })).toBe(false)
  })

  it("accepts a pre-computed effective set", () => {
    loadFilters(["Vegan", "Glutenfrei"])
    const custom = new Set(["OnlyThis"])
    expect(itemMatchesFilters({ tags: ["OnlyThis"] }, custom)).toBe(true)
    expect(itemMatchesFilters({ tags: ["Vegan"] }, custom)).toBe(false)
  })
})
