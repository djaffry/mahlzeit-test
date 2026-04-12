import { describe, it, expect, vi } from "vitest"

vi.mock("../../utils/tag-utils", () => ({
  getTagColor: (tag: string) => `--tag-${tag.toLowerCase()}`,
}))
vi.mock("../../i18n/i18n", () => ({
  t: (key: string) => key.startsWith("tag.") ? key.slice(4) : key,
}))
vi.mock("../../utils/dom", () => ({
  escapeHtml: (s: string) => s,
}))
vi.mock("../../icons", () => ({
  icons: { checkSmall: '<svg class="check"/>' },
}))

import { renderItem } from "./menu-item"

describe("renderItem", () => {
  it("renders title and check icon", () => {
    const html = renderItem({ title: "Gulasch", description: null, price: null, tags: [], allergens: null })
    expect(html).toContain("Gulasch")
    expect(html).toContain("menu-item-title")
    expect(html).toContain("menu-item-check")
  })

  it("renders price when provided", () => {
    const html = renderItem({ title: "Schnitzel", description: null, price: "€ 12,90", tags: [], allergens: null })
    expect(html).toContain("€ 12,90")
    expect(html).toContain("menu-item-price")
  })

  it("omits price span when no price", () => {
    const html = renderItem({ title: "Soup", description: null, price: null, tags: [], allergens: null })
    expect(html).not.toContain("menu-item-price")
  })

  it("renders description when provided", () => {
    const html = renderItem({ title: "Steak", description: "Well done", price: null, tags: [], allergens: null })
    expect(html).toContain("Well done")
    expect(html).toContain("menu-item-description")
  })

  it("omits description div when no description", () => {
    const html = renderItem({ title: "Steak", description: null, price: null, tags: [], allergens: null })
    expect(html).not.toContain("menu-item-description")
  })

  it("renders allergens when provided", () => {
    const html = renderItem({ title: "Pasta", description: null, price: null, tags: [], allergens: "A, C, G" })
    expect(html).toContain("A, C, G")
    expect(html).toContain("menu-item-allergens")
  })

  it("omits allergens div when no allergens", () => {
    const html = renderItem({ title: "Pasta", description: null, price: null, tags: [], allergens: null })
    expect(html).not.toContain("menu-item-allergens")
  })

  it("renders tag pills", () => {
    const html = renderItem({ title: "Bowl", description: null, price: null, tags: ["Vegan", "Bio"], allergens: null })
    expect(html).toContain("tag-pill")
    expect(html).toContain("Vegan")
    expect(html).toContain("Bio")
    expect(html).toContain("menu-item-tags")
  })

  it("puts lowercased tags in data-tags attribute", () => {
    const html = renderItem({ title: "Bowl", description: null, price: null, tags: ["Vegan", "Bio"], allergens: null })
    expect(html).toContain('data-tags="vegan bio"')
  })

  it("omits tag pills when tags is empty", () => {
    const html = renderItem({ title: "Toast", description: null, price: null, tags: [], allergens: null })
    expect(html).not.toContain("menu-item-tags")
  })

  it("includes data-cat-idx and data-item-idx when provided", () => {
    const html = renderItem({ title: "Rice", description: null, price: null, tags: [], allergens: null }, 2, 5)
    expect(html).toContain('data-cat-idx="2"')
    expect(html).toContain('data-item-idx="5"')
  })

  it("omits data-cat-idx and data-item-idx when not provided", () => {
    const html = renderItem({ title: "Rice", description: null, price: null, tags: [], allergens: null })
    expect(html).not.toContain("data-cat-idx")
    expect(html).not.toContain("data-item-idx")
  })
})
