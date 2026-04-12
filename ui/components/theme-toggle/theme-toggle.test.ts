import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../utils/dom", () => ({
  prefersReducedMotion: () => true,
}))

// jsdom doesn't implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

import { getEffectiveTheme, cycleTheme, setupThemeToggle } from "./theme-toggle"

describe("theme-toggle", () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    document.documentElement.classList.remove("theme-transition")
    document.documentElement.style.removeProperty("background")
    document.documentElement.style.removeProperty("color")
  })

  describe("getEffectiveTheme", () => {
    it("returns 'dark' when stored theme is dark", () => {
      localStorage.setItem("theme", "dark")
      expect(getEffectiveTheme()).toBe("dark")
    })

    it("returns 'light' when stored theme is light", () => {
      localStorage.setItem("theme", "light")
      expect(getEffectiveTheme()).toBe("light")
    })

    it("falls back to system preference when no stored theme", () => {
      // matchMedia mock returns matches:true for "(prefers-color-scheme: dark)"
      const result = getEffectiveTheme()
      expect(result).toBe("dark")
    })
  })

  describe("cycleTheme", () => {
    it("toggles from light to dark", () => {
      localStorage.setItem("theme", "light")
      cycleTheme()
      expect(localStorage.getItem("theme")).toBe("dark")
      expect(document.documentElement.dataset.theme).toBe("dark")
    })

    it("toggles from dark to light", () => {
      localStorage.setItem("theme", "dark")
      cycleTheme()
      expect(localStorage.getItem("theme")).toBe("light")
      expect(document.documentElement.dataset.theme).toBe("light")
    })
  })

  describe("setupThemeToggle", () => {
    it("sets data-theme to match effective theme on boot", () => {
      localStorage.setItem("theme", "dark")
      setupThemeToggle()
      expect(document.documentElement.dataset.theme).toBe("dark")
    })

    it("clears FOUC inline styles", () => {
      document.documentElement.style.setProperty("background", "#000")
      document.documentElement.style.setProperty("color", "#fff")
      setupThemeToggle()
      // removeProperty is called for both - verify no inline value remains
      expect(document.documentElement.style.getPropertyValue("background")).toBe("")
      expect(document.documentElement.style.getPropertyValue("color")).toBe("")
    })

    it("resolves system preference on boot", () => {
      // No stored theme → system mode → resolves to matchMedia mock (dark)
      setupThemeToggle()
      expect(document.documentElement.dataset.theme).toBe("dark")
    })
  })
})
