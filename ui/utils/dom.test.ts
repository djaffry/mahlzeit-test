import { describe, it, expect } from "vitest"
import { escapeHtml, highlightMatch } from "./dom"

/* ── escapeHtml ─────────────────────────────────────────── */

describe("escapeHtml", () => {
  it("escapes < character", () => {
    expect(escapeHtml("<")).toBe("&lt;")
  })

  it("escapes > character", () => {
    expect(escapeHtml(">")).toBe("&gt;")
  })

  it("escapes & character", () => {
    expect(escapeHtml("&")).toBe("&amp;")
  })

  it("leaves \" unescaped in text node context (double quotes are safe in text nodes)", () => {
    // jsdom's innerHTML serialiser does not escape double quotes inside text nodes —
    // they are only escaped inside attribute values. The raw `"` is the correct output.
    expect(escapeHtml('"')).toBe('"')
  })

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("")
  })
})

/* ── highlightMatch ─────────────────────────────────────── */

describe("highlightMatch", () => {
  it("wraps matching text in <mark> tags", () => {
    const result = highlightMatch("Schnitzel mit Sauce", "Schnitzel")
    expect(result).toBe("<mark>Schnitzel</mark> mit Sauce")
  })

  it("is case insensitive", () => {
    const result = highlightMatch("Wiener Schnitzel", "wiener")
    expect(result).toContain("<mark>")
    expect(result.toLowerCase()).toContain("wiener")
  })

  it("escapes regex special characters in the query", () => {
    // A dot in the query should match only a literal dot, not any character
    const result = highlightMatch("a.b and acb", "a.b")
    expect(result).toContain("<mark>a.b</mark>")
    // "acb" should NOT be wrapped since the dot was escaped
    expect(result).not.toContain("<mark>acb</mark>")
  })

  it("wraps all occurrences of the match", () => {
    const result = highlightMatch("Suppe Suppe Gulasch", "Suppe")
    const matches = result.match(/<mark>/g)
    expect(matches).toHaveLength(2)
  })

  it("returns the original string unchanged when query is not found", () => {
    const result = highlightMatch("Schnitzel", "Gulasch")
    expect(result).toBe("Schnitzel")
  })
})
