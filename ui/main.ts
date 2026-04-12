import "./styles/index.css"

import { setupThemeToggle } from "./components/theme-toggle/theme-toggle"
import { setupPartyMode } from "./components/party-mode/party-mode"
import { flushPendingVotes } from "./voting/init"
import { initApp } from "./views/app"

setupPartyMode()
setupThemeToggle()
initApp()

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPendingVotes()
})

window.addEventListener("beforeunload", flushPendingVotes)

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {})
}
