import "./stale-banner.css"
import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { icons } from "../../icons"
import { getTodayName, isDataFromCurrentWeek } from "../../utils/date"
import type { Restaurant } from "../../types"

export function updateStaleBanner(menuRestaurants: Restaurant[]): void {
  document.getElementById("stale-banner")?.remove()

  const today = getTodayName()
  const isWeekend = !today
  const isStale = !isDataFromCurrentWeek(menuRestaurants)
  if (!isWeekend && !isStale) return

  const banner = document.createElement("div")
  banner.id = "stale-banner"
  banner.className = "stale-banner"
  const text = isWeekend
    ? escapeHtml(t("weekend.banner") ?? "It\u2019s the weekend \u2014 menus shown are from last week.")
    : escapeHtml(t("stale.banner") ?? "Menus are not yet updated for this week.")
  banner.innerHTML = `${icons.bird}<span>${text}</span>`

  const timeline = document.getElementById("timeline")
  timeline?.before(banner)
}
