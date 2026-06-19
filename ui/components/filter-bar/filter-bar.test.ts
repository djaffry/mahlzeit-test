import { describe, it, expect, vi, beforeEach } from "vitest"

/* ── Mock tag-utils (controllable) ─────────────────────── */

const mockIsLoaded = vi.fn(() => false)
const mockExpandFilters = vi.fn((s: Set<string>) => new Set(s))

vi.mock("../../utils/tag-utils", () => ({
  getTagColor: () => "--fg-muted",
  expandFilters: (s: Set<string>) => mockExpandFilters(s),
  getDescendants: (tag: string) => new Set([tag]),
  isLoaded: () => mockIsLoaded(),
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
  vi.clearAllMocks()
  mockIsLoaded.mockReturnValue(false)
  mockExpandFilters.mockImplementation((s: Set<string>) => new Set(s))
})

describe("loadFilters", () => {
  it("activates all tags when no localStorage entry exists", () => {
    loadFilters(["Vegan", "Fleisch"])
    expect(isFilterShowAll()).toBe(true)
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan", "Fleisch"]))
  })

  it("restores previously active filters from localStorage", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan"]))
    expect(isFilterShowAll()).toBe(false)
  })

  it("auto-activates new tags not in known set", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch", "Bio"])
    const effective = getEffectiveFilters()
    expect(effective.has("Vegan")).toBe(true)
    expect(effective.has("Bio")).toBe(true)
    expect(effective.has("Fleisch")).toBe(false)
  })

  it("ignores stored active filters not in available tags", () => {
    setupLocalStorage({ active: ["Removed"], known: ["Removed"] })
    loadFilters(["Vegan"])
    expect(getEffectiveFilters()).toEqual(new Set(["Vegan"]))
  })
})

describe("saveFilters", () => {
  it("persists current active filters to localStorage", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    saveFilters()
    const stored = JSON.parse(localStorage.getItem("dietary-filters")!)
    expect(stored.active).toEqual(["Vegan"])
    expect(stored.known).toEqual(["Vegan", "Fleisch"])
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
    loadFilters(["Vegan", "Fleisch"])
    const a = getEffectiveFilters()
    const b = getEffectiveFilters()
    expect(a).toBe(b) // same reference = cached
  })

  it("uses hierarchy expansion when tags are loaded", () => {
    mockIsLoaded.mockReturnValue(true)
    mockExpandFilters.mockImplementation(() => new Set(["Fleisch", "Schweinefleisch", "Rindfleisch"]))

    loadFilters(["Fleisch", "Schweinefleisch", "Rindfleisch"])
    const result = getEffectiveFilters()
    expect(result.has("Schweinefleisch")).toBe(true)
    expect(result.has("Rindfleisch")).toBe(true)
  })

  it("removes explicitly deselected children from hierarchy expansion", () => {
    mockIsLoaded.mockReturnValue(true)
    mockExpandFilters.mockImplementation(() => new Set(["Fleisch", "Schweinefleisch", "Rindfleisch"]))

    setupLocalStorage({
      active: ["Fleisch", "Schweinefleisch"],
      known: ["Fleisch", "Schweinefleisch", "Rindfleisch"],
    })
    loadFilters(["Fleisch", "Schweinefleisch", "Rindfleisch"])
    const result = getEffectiveFilters()
    expect(result.has("Rindfleisch")).toBe(false)
    expect(result.has("Schweinefleisch")).toBe(true)
  })
})

describe("itemMatchesFilters", () => {
  it("returns true when item has no tags", () => {
    loadFilters(["Vegan"])
    expect(itemMatchesFilters({})).toBe(true)
    expect(itemMatchesFilters({ tags: [] })).toBe(true)
  })

  it("returns true when item has a matching tag", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    expect(itemMatchesFilters({ tags: ["Vegan"] })).toBe(true)
  })

  it("returns false when item has no matching tags", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    expect(itemMatchesFilters({ tags: ["Fleisch"] })).toBe(false)
  })

  it("accepts a pre-computed effective set", () => {
    loadFilters(["Vegan", "Fleisch"])
    const custom = new Set(["OnlyThis"])
    expect(itemMatchesFilters({ tags: ["OnlyThis"] }, custom)).toBe(true)
    expect(itemMatchesFilters({ tags: ["Vegan"] }, custom)).toBe(false)
  })

  it("always shows items with only informative tags (Glutenfrei)", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    expect(itemMatchesFilters({ tags: ["Glutenfrei"] })).toBe(true)
  })

  it("always shows items with only informative tags (Laktosefrei)", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    expect(itemMatchesFilters({ tags: ["Laktosefrei"] })).toBe(true)
  })

  it("filters normally when item has informative + filterable tags", () => {
    setupLocalStorage({ active: ["Vegan"], known: ["Vegan", "Fleisch"] })
    loadFilters(["Vegan", "Fleisch"])
    // Has Glutenfrei (informative) + Vegan (active) → shown
    expect(itemMatchesFilters({ tags: ["Glutenfrei", "Vegan"] })).toBe(true)
    // Has Glutenfrei (informative) + Fleisch (not active) → hidden
    expect(itemMatchesFilters({ tags: ["Glutenfrei", "Fleisch"] })).toBe(false)
  })
})
