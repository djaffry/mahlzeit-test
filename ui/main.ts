import "./styles/index.css"

import { setupThemeToggle } from "./components/theme-toggle/theme-toggle"
import { initApp } from "./views/app"

setupThemeToggle()
initApp()

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {})
}
