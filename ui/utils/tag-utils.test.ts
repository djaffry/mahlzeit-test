import { describe, it, expect, beforeEach } from "vitest"
import { getDescendants, expandFilters, getParentTags, loadHierarchy, getTagColor, tagStyle, collectTags, renderTags } from "./tag-utils"
import type { Restaurant } from "../types"

describe("tag hierarchy", () => {
  const hierarchy = {
    Fleisch: ["Schweinefleisch", "Rindfleisch", "Geflügel", "Lamm"],
    Geflügel: ["Huhn", "Ente", "Pute"],
    Vegetarisch: ["Vegan"],
  }

  beforeEach(() => loadHierarchy(hierarchy))

  it("getDescendants returns all nested children", () => {
    const desc = getDescendants("Fleisch")
    expect(desc).toContain("Fleisch")
    expect(desc).toContain("Schweinefleisch")
    expect(desc).toContain("Huhn")
  })

  it("getDescendants handles circular hierarchy without infinite loop", () => {
    loadHierarchy({ A: ["B"], B: ["A"] })
    const desc = getDescendants("A")
    expect(desc).toContain("A")
    expect(desc).toContain("B")
  })

  it("expandFilters expands all active filters", () => {
    const expanded = expandFilters(new Set(["Vegetarisch"]))
    expect(expanded).toContain("Vegetarisch")
    expect(expanded).toContain("Vegan")
  })

  it("getParentTags returns hierarchy keys", () => {
    expect(getParentTags()).toContain("Fleisch")
    expect(getParentTags()).toContain("Vegetarisch")
  })
})

describe("getTagColor", () => {
  it("returns preset color for known tag", () => {
    expect(getTagColor("Vegan")).toBe("green")
  })

  it("returns a consistent color for unknown tags", () => {
    const c1 = getTagColor("SomeNewTag")
    const c2 = getTagColor("SomeNewTag")
    expect(c1).toBe(c2)
    expect(typeof c1).toBe("string")
  })
})

describe("tagStyle", () => {
  it("returns CSS background+color string", () => {
    const style = tagStyle("Vegan")
    expect(style).toContain("--green-dim")
    expect(style).toContain("--green")
  })
})

const restaurant: Restaurant = {
  id: "test", title: "Test", url: "", type: "full",
  fetchedAt: "2026-03-20T10:00:00Z", error: null,
  days: {
    Montag: {
      categories: [{
        name: "Haupt",
        items: [
          { title: "A", description: null, price: null, tags: ["Vegan", "CustomTag"], allergens: null },
          { title: "B", description: null, price: null, tags: ["Fleisch"], allergens: null },
        ]
      }]
    }
  }
}

describe("collectTags", () => {
  beforeEach(() => {
    loadHierarchy({})
  })

  it("returns tags from restaurant menu items", () => {
    const tags = collectTags([restaurant])
    expect(tags).toContain("Vegan")
    expect(tags).toContain("Fleisch")
    expect(tags).toContain("CustomTag")
  })

  it("includes parent tags from hierarchy when loaded", () => {
    loadHierarchy({ Vegetarisch: ["Vegan"] })
    const tags = collectTags([restaurant])
    expect(tags).toContain("Vegetarisch")
  })

  it("sorts preset tags (from TAG_COLORS) before unknown tags", () => {
    const tags = collectTags([restaurant])
    const veganIdx = tags.indexOf("Vegan")
    const fleischIdx = tags.indexOf("Fleisch")
    const customIdx = tags.indexOf("CustomTag")
    expect(veganIdx).toBeGreaterThanOrEqual(0)
    expect(fleischIdx).toBeGreaterThanOrEqual(0)
    expect(customIdx).toBeGreaterThanOrEqual(0)
    // Both Vegan and Fleisch are preset tags; CustomTag is unknown — preset tags come first
    expect(veganIdx).toBeLessThan(customIdx)
    expect(fleischIdx).toBeLessThan(customIdx)
  })

  it("returns empty array for restaurants with no menu data", () => {
    const empty: Restaurant = {
      id: "empty", title: "Empty", url: "", type: "full",
      fetchedAt: "2026-03-20T10:00:00Z", error: null,
      days: {}
    }
    loadHierarchy({})
    const tags = collectTags([empty])
    expect(tags).toEqual([])
  })
})

describe("renderTags", () => {
  it("renders tag spans with correct style attributes", () => {
    const html = renderTags(["Vegan"])
    expect(html).toContain('<span class="tag"')
    expect(html).toContain("style=")
    expect(html).toContain("Vegan")
    expect(html).toContain("background:var(--green-dim)")
  })

  it("returns empty string for empty array", () => {
    expect(renderTags([])).toBe("")
  })

  it("escapes HTML in tag names", () => {
    const html = renderTags(["<script>"])
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
