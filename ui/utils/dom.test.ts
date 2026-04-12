import { describe, it, expect, vi, afterEach } from "vitest"
import { escapeHtml, highlightMatch, isDesktop } from "./dom"
import { DESKTOP_MIN_WIDTH } from "../constants"

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
    // jsdom's innerHTML serialiser does not escape double quotes inside text nodes -
    // they are only escaped inside attribute values. The raw `"` is the correct output.
    expect(escapeHtml('"')).toBe('"')
  })

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("")
  })
})

/* ── highlightMatch ─────────────────────────────────────── */

describe("highlightMatch", () => {
  it("wraps matching text in highlight span", () => {
    const result = highlightMatch("Schnitzel mit Sauce", "Schnitzel")
    expect(result).toBe('<span class="search-highlight">Schnitzel</span> mit Sauce')
  })

  it("is case insensitive", () => {
    const result = highlightMatch("Wiener Schnitzel", "wiener")
    expect(result).toContain('<span class="search-highlight">Wiener</span>')
  })

  it("returns escaped text when query is not found", () => {
    const result = highlightMatch("Schnitzel", "Gulasch")
    expect(result).toBe("Schnitzel")
  })

  it("returns escaped text when query is empty", () => {
    const result = highlightMatch("Schnitzel", "")
    expect(result).toBe("Schnitzel")
  })

  it("escapes HTML in the text", () => {
    const result = highlightMatch("<b>Bold</b> & Schnitzel", "Schnitzel")
    expect(result).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; ")
    expect(result).toContain('<span class="search-highlight">Schnitzel</span>')
  })
})

/* ── isDesktop ─────────────────────────────────────────── */

describe("isDesktop", () => {
  const originalInnerWidth = window.innerWidth

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true })
  })

  it("returns true when window width equals DESKTOP_MIN_WIDTH", () => {
    Object.defineProperty(window, "innerWidth", { value: DESKTOP_MIN_WIDTH, configurable: true })
    expect(isDesktop()).toBe(true)
  })

  it("returns true when window width exceeds DESKTOP_MIN_WIDTH", () => {
    Object.defineProperty(window, "innerWidth", { value: DESKTOP_MIN_WIDTH + 200, configurable: true })
    expect(isDesktop()).toBe(true)
  })

  it("returns false when window width is below DESKTOP_MIN_WIDTH", () => {
    Object.defineProperty(window, "innerWidth", { value: DESKTOP_MIN_WIDTH - 1, configurable: true })
    expect(isDesktop()).toBe(false)
  })

  it("returns false for typical mobile width", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true })
    expect(isDesktop()).toBe(false)
  })
})
