import "../../styles/party.css"
import { icons } from "../../icons"

/* ── Party Mode (Easter Egg) ────────────────────────────── */

const CONFETTI_ICONS = [
  icons.pizza, icons.hamburger, icons.soup, icons.fish,
  icons.salad, icons.beer, icons.coffee, icons.beef,
  icons.sandwich, icons.crown,
]

function burstConfetti(x: number, y: number, count = 18): void {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span")
    el.className = "party-confetti"
    el.innerHTML = CONFETTI_ICONS[Math.floor(Math.random() * CONFETTI_ICONS.length)]
    el.style.left = `${x}px`
    el.style.top = `${y}px`

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6
    const dist = 40 + Math.random() * 80
    el.style.setProperty("--dx", `${Math.cos(angle) * dist}px`)
    el.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`)
    el.style.animationDelay = `${Math.random() * 0.1}s`

    document.body.appendChild(el)
    el.addEventListener("animationend", () => el.remove(), { once: true })
  }
}

const BURST_DEBOUNCE_MS = 120
let _lastBurst = 0

export function setupPartyMode(): void {
  if (localStorage.getItem("party") === "1") {
    document.documentElement.classList.add("party")
  }

  document.addEventListener("click", (e) => {
    const isToggle = (e.target as Element).closest?.("#party-toggle")

    if (isToggle) {
      const willBeParty = !document.documentElement.classList.contains("party")
      document.documentElement.classList.toggle("party")
      localStorage.setItem("party", willBeParty ? "1" : "0")
      if (willBeParty) burstConfetti(e.clientX, e.clientY)
      return
    }

    if (document.documentElement.classList.contains("party")) {
      const now = performance.now()
      if (now - _lastBurst < BURST_DEBOUNCE_MS) return
      _lastBurst = now
      burstConfetti(e.clientX, e.clientY, 6)
    }
  })
}
