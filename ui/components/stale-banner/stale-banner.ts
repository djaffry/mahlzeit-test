import "./stale-banner.css"
import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { icons } from "../../icons"
import { isDataFromCurrentWeek, isWeekend } from "../../utils/date"
import { todayIso } from "../../utils/today"
import { getArchiveWeek, exitArchive, formatWeekLabel, isArchiveMode } from "../../archive/archive"
import type { Restaurant } from "../../types"

export function updateStaleBanner(menuRestaurants: Restaurant[]): void {
  document.getElementById("stale-banner")?.remove()

  if (isArchiveMode()) {
    renderArchiveBanner()
    return
  }

  const weekend = isWeekend(todayIso())
  const isStale = !isDataFromCurrentWeek(menuRestaurants)
  if (!weekend && !isStale) return

  const banner = document.createElement("div")
  banner.id = "stale-banner"
  banner.className = "stale-banner"
  const text = weekend
    ? escapeHtml(t("weekend.banner") ?? "It\u2019s the weekend \u2014 menus shown are from last week.")
    : escapeHtml(t("stale.banner") ?? "Menus are not yet updated for this week.")
  banner.innerHTML = `${icons.bird}<span>${text}</span>`

  document.getElementById("timeline")?.before(banner)
}

function renderArchiveBanner(): void {
  const week = getArchiveWeek()
  if (!week) return
  const label = formatWeekLabel(week)
  const bannerText = escapeHtml(t("archive.banner", { label }))
  const backLabel = escapeHtml(t("archive.backToCurrent"))
  const banner = document.createElement("div")
  banner.id = "stale-banner"
  banner.className = "stale-banner stale-banner-archive"
  banner.innerHTML = `
    ${icons.history}
    <span>${bannerText}</span>
    <button type="button" class="archive-back-btn">${icons.arrowLeft}<span class="archive-back-label">${backLabel}</span></button>
  `
  banner.querySelector(".archive-back-btn")?.addEventListener("click", () => exitArchive())

  document.getElementById("timeline")?.before(banner)
}
