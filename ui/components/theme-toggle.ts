import { prefersReducedMotion } from "../utils/dom"

export function setupThemeToggle(): void {
  const btn = document.getElementById("theme-toggle")!
  btn.addEventListener("click", () => {
    const root = document.documentElement
    const reducedMotion = prefersReducedMotion()

    function applyTheme(): void {
      const next = root.dataset.theme === "latte" ? "" : "latte"
      if (next) {
        root.dataset.theme = next
        localStorage.setItem("theme", next)
      } else {
        delete root.dataset.theme
        localStorage.removeItem("theme")
      }
    }

    if (reducedMotion) {
      applyTheme()
    } else if (document.startViewTransition) {
      const rect = btn.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      root.style.setProperty("--toggle-x", x + "px")
      root.style.setProperty("--toggle-y", y + "px")
      document.startViewTransition(applyTheme)
    } else {
      root.classList.add("theme-transitioning")
      applyTheme()
      setTimeout(() => root.classList.remove("theme-transitioning"), 350)
    }
  })
}

export function setupPartyMode(): void {
  const btn = document.getElementById("party-toggle")!
  if (localStorage.getItem("party") === "on") {
    document.documentElement.classList.add("party")
  }
  btn.addEventListener("click", () => {
    const on = document.documentElement.classList.toggle("party")
    localStorage.setItem("party", on ? "on" : "")
  })
}
