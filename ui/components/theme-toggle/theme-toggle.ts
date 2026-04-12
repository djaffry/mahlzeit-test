import { prefersReducedMotion } from "../../utils/dom"

type ThemeMode = "light" | "dark" | "system"

let _themeTimer: ReturnType<typeof setTimeout> | null = null

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem("theme")
  if (stored === "light" || stored === "dark") return stored
  return "system"
}

export function getEffectiveTheme(): "light" | "dark" {
  const mode = getStoredTheme()
  if (mode === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  return mode
}

function applyTheme(mode: ThemeMode, animate = false): void {
  const el = document.documentElement
  const shouldAnimate = animate && !prefersReducedMotion()

  if (shouldAnimate) {
    if (_themeTimer) clearTimeout(_themeTimer)
    el.classList.add("theme-transition")
  }

  if (mode === "system") {
    localStorage.removeItem("theme")
    delete el.dataset.theme
  } else {
    localStorage.setItem("theme", mode)
    el.dataset.theme = mode
  }

  if (shouldAnimate) {
    const ms = parseFloat(getComputedStyle(el).getPropertyValue("--duration-slow")) || 300
    _themeTimer = setTimeout(() => {
      el.classList.remove("theme-transition")
      _themeTimer = null
    }, ms)
  }

  // Clear inline styles set by index.html FOUC prevention script
  const s = document.documentElement.style
  s.removeProperty("background")
  s.removeProperty("color")

  const meta = document.querySelector('meta[name="theme-color"]')
  const effective = getEffectiveTheme()
  meta?.setAttribute("content", effective === "dark" ? "#111111" : "#ffffff")
}

export function cycleTheme(): void {
  const effective = getEffectiveTheme()
  applyTheme(effective === "light" ? "dark" : "light", true)
}

export function setupThemeToggle(): void {
  // On boot, resolve the effective theme so data-theme is always set
  // and FOUC inline styles from index.html are cleared
  applyTheme(getEffectiveTheme())
}
