import "./auto-refresh.css"
import { config } from "../config"
import { fetchMenuDataQuiet } from "./fetcher"
import { getCurrentLanguage, getSourceLanguage, t } from "../i18n/i18n"
import type { Restaurant } from "../types"

const TOAST_DURATION_MS = 3000

let _lastContentHash: string | null = null
let _refreshToast: HTMLElement | null = null
let _refreshToastTimer: ReturnType<typeof setTimeout> | null = null

export function contentHash(restaurants: Restaurant[]): string {
  const strip = (rs: Restaurant[]) => rs.map(({ fetchedAt, ...rest }) => rest)
  return JSON.stringify(strip(restaurants))
}

export function initContentHash(restaurants: Restaurant[]): void {
  _lastContentHash = contentHash(restaurants)
}

function createRefreshToast(): HTMLElement {
  const toast = document.createElement("div")
  toast.className = "refresh-toast"
  toast.setAttribute("role", "status")
  toast.setAttribute("aria-live", "polite")
  document.body.appendChild(toast)
  return toast
}

function showRefreshToast(): void {
  _refreshToast ??= createRefreshToast()
  if (_refreshToastTimer) clearTimeout(_refreshToastTimer)
  _refreshToast.textContent = ""
  _refreshToast.classList.remove("visible")
  void _refreshToast.offsetWidth
  _refreshToast.textContent = t("refresh.toast")
  _refreshToast.classList.add("visible")
  _refreshToastTimer = setTimeout(() => _refreshToast!.classList.remove("visible"), TOAST_DURATION_MS)
}


export function startAutoRefresh(
  getCurrentRestaurants: () => Restaurant[],
  isRefreshDeferred: () => boolean,
  applyRefresh: (data: Restaurant[]) => void
): void {
  let pendingData: Restaurant[] | null = null

  let pendingHash: string | null = null

  function applyData(data: Restaurant[], hash: string): void {
    pendingData = null
    pendingHash = null
    _lastContentHash = hash
    applyRefresh(data)
    showRefreshToast()
  }

  async function checkForUpdates(): Promise<void> {
    // Flush buffered data from a previous deferred cycle
    if (pendingData && pendingHash && !isRefreshDeferred()) {
      applyData(pendingData, pendingHash)
      return
    }

    const current = getCurrentRestaurants()
    const newData = await fetchMenuDataQuiet(current, getCurrentLanguage(), getSourceLanguage())
    if (!newData) return

    const newHash = contentHash(newData)
    if (newHash === _lastContentHash) return

    if (isRefreshDeferred()) {
      pendingData = newData
      pendingHash = newHash
      return
    }

    applyData(newData, newHash)
  }

  setInterval(checkForUpdates, config.autoRefreshInterval)
}
