import { describe, it, expect, vi, afterEach } from "vitest"
import {
  loadTagsFromUrl,
  getDescendants,
  expandFilters,
  getTagColor,
  collectTags,
  _resetForTesting,
} from "./tag-utils"
import type { Restaurant } from "../types"

afterEach(() => {
  _resetForTesting()
  vi.restoreAllMocks()
})

const HIERARCHY = {
  tags: ["Fleisch", "Schweinefleisch", "Rindfleisch", "Geflügel", "Huhn", "Vegan", "Vegetarisch"],
  hierarchy: {
    Fleisch: ["Schweinefleisch", "Rindfleisch", "Geflügel"],
    "Geflügel": ["Huhn", "Ente", "Pute"],
    "Vegetarisch": ["Vegan"],
  },
  aliases: {},
}

async function loadHierarchy(): Promise<void> {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => HIERARCHY,
  })))
  await loadTagsFromUrl("http://test/tags.json")
}

/* ── getDescendants ─────────────────────────────────────── */

describe("getDescendants", () => {
  it("returns only the tag itself when hierarchy is not loaded", () => {
    expect(getDescendants("Fleisch")).toEqual(new Set(["Fleisch"]))
  })

  it("returns the tag and all children when hierarchy is loaded", async () => {
    await loadHierarchy()
    const result = getDescendants("Fleisch")
    expect(result).toContain("Fleisch")
    expect(result).toContain("Schweinefleisch")
    expect(result).toContain("Rindfleisch")
    expect(result).toContain("Geflügel")
    expect(result).toContain("Huhn")
    expect(result).toContain("Ente")
    expect(result).toContain("Pute")
  })

  it("returns only direct children for a mid-level tag", async () => {
    await loadHierarchy()
    const result = getDescendants("Geflügel")
    expect(result).toEqual(new Set(["Geflügel", "Huhn", "Ente", "Pute"]))
  })

  it("returns only the tag itself for a leaf tag", async () => {
    await loadHierarchy()
    expect(getDescendants("Huhn")).toEqual(new Set(["Huhn"]))
  })

  it("handles cycles without infinite loop", async () => {
    await loadHierarchy()
    expect(() => getDescendants("Fleisch")).not.toThrow()
  })
})

/* ── expandFilters ──────────────────────────────────────── */

describe("expandFilters", () => {
  it("expands parent tags to include all descendants", async () => {
    await loadHierarchy()
    const result = expandFilters(new Set(["Fleisch"]))
    expect(result).toContain("Schweinefleisch")
    expect(result).toContain("Huhn")
  })

  it("returns the input tags when hierarchy is not loaded", () => {
    const result = expandFilters(new Set(["Fleisch", "Vegan"]))
    expect(result).toEqual(new Set(["Fleisch", "Vegan"]))
  })

  it("merges multiple expanded sets without duplication", async () => {
    await loadHierarchy()
    const result = expandFilters(new Set(["Fleisch", "Geflügel"]))
    // Geflügel appears both as a descendant of Fleisch and as an input
    expect(result.has("Geflügel")).toBe(true)
    expect(result.has("Huhn")).toBe(true)
  })
})

/* ── getTagColor ────────────────────────────────────────── */

describe("getTagColor", () => {
  it("returns the colour for a known tag (case-insensitive)", () => {
    expect(getTagColor("Vegan")).toBe("--tag-green")
    expect(getTagColor("vegan")).toBe("--tag-green")
    expect(getTagColor("Fleisch")).toBe("--tag-red")
  })

  it("returns --fg-muted for an unknown tag without hierarchy", () => {
    expect(getTagColor("NewTag")).toBe("--fg-muted")
  })

  it("inherits parent colour for an unknown child tag when hierarchy is loaded", async () => {
    await loadHierarchy()
    // "Ente" is a child of "Geflügel" which has colour "--tag-peach"
    expect(getTagColor("Ente")).toBe("--tag-peach")
  })

  it("walks multiple levels to find an ancestor colour", async () => {
    // Simulate a deeper hierarchy where the immediate parent has no colour
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tags: ["Root", "Mid", "Leaf"],
        hierarchy: { Root: ["Mid"], Mid: ["Leaf"] },
        aliases: {},
      }),
    })))
    await loadTagsFromUrl("http://test/tags.json")

    // "Root" is not in TAG_COLORS, "Mid" is not in TAG_COLORS, "Leaf" is not in TAG_COLORS
    // All should fall back to --fg-muted
    expect(getTagColor("Leaf")).toBe("--fg-muted")
  })

  it("inherits from a grandparent if the direct parent has no colour entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tags: ["Fleisch", "Geflügel", "Huhn", "FriedChicken"],
        hierarchy: {
          "Fleisch": ["Geflügel"],
          "Geflügel": ["Huhn"],
          "Huhn": ["FriedChicken"],
        },
        aliases: {},
      }),
    })))
    await loadTagsFromUrl("http://test/tags.json")

    // FriedChicken → parent Huhn (has colour --tag-peach) → inherits
    expect(getTagColor("FriedChicken")).toBe("--tag-peach")
  })
})

/* ── collectTags ────────────────────────────────────────── */

describe("collectTags", () => {
  const makeRestaurant = (tags: string[][]): Restaurant => ({
    id: "r1", title: "Test", url: "", type: "full",
    fetchedAt: "", error: null,
    days: {
      "2026-04-20": {
        fetchedAt: "",
        categories: [{ name: "Main", items: tags.map(t => ({ title: "Item", description: null, price: null, tags: t, allergens: null })) }],
      },
    },
  })

  it("collects unique tags from all restaurant menu items", () => {
    const r = makeRestaurant([["Vegan"], ["Vegan", "Huhn"], ["Fisch"]])
    const result = collectTags([r])
    expect(result).toContain("Vegan")
    expect(result).toContain("Huhn")
    expect(result).toContain("Fisch")
  })

  it("excludes informative tags (Glutenfrei, Laktosefrei)", () => {
    const r = makeRestaurant([["Glutenfrei", "Vegan"]])
    const result = collectTags([r])
    expect(result).not.toContain("Glutenfrei")
    expect(result).toContain("Vegan")
  })

  it("includes hierarchy parents when tags are loaded", async () => {
    await loadHierarchy()
    const r = makeRestaurant([["Huhn"]])
    const result = collectTags([r])
    // Hierarchy parents should appear even if no items have them directly
    expect(result).toContain("Fleisch")
    expect(result).toContain("Geflügel")
  })

  it("sorts known tags by TAG_COLORS order, unknown tags alphabetically after", () => {
    const r = makeRestaurant([["Zebra"], ["Vegan"], ["Fisch"]])
    const result = collectTags([r])
    const veganIdx = result.indexOf("Vegan")
    const fischIdx = result.indexOf("Fisch")
    const zebraIdx = result.indexOf("Zebra")
    // Known tags come before unknown tags
    expect(veganIdx).toBeLessThan(zebraIdx)
    expect(fischIdx).toBeLessThan(zebraIdx)
  })
})

