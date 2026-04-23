import { config } from "../config"
import { t, getLocale } from "../i18n/i18n"
import { getWeekDates } from "../utils/date"

const WEEK_RE = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/

export function getArchiveWeek(): string | null {
  const raw = new URLSearchParams(window.location.search).get("week")
  return raw && WEEK_RE.test(raw) ? raw : null
}

export function isArchiveMode(): boolean {
  return getArchiveWeek() !== null
}

export function getDataBasePath(): string {
  const week = getArchiveWeek()
  return week ? `${config.archivePath}/${week}` : config.dataPath
}

/**
 * Returns the Monday of the ISO week as a local Date, or null for malformed input.
 * ISO 8601: week 1 of year Y is the week containing Y's first Thursday.
 */
function mondayOfIsoWeek(week: string): Date | null {
  const m = WEEK_RE.exec(week)
  if (!m) return null
  const year = Number(m[1])
  const wk = Number(m[2])
  // Jan 4 is always in ISO week 1. Snap back to its Monday, then advance (wk-1) weeks.
  const jan4 = new Date(year, 0, 4)
  const jan4Dow = jan4.getDay() || 7  // Sun=0 → 7
  const week1Monday = new Date(year, 0, 4 - (jan4Dow - 1))
  const monday = new Date(week1Monday)
  monday.setDate(week1Monday.getDate() + (wk - 1) * 7)
  return monday
}

export function formatWeekLabel(week: string): string {
  const monday = mondayOfIsoWeek(week)
  if (!monday) return week
  const m = WEEK_RE.exec(week)!
  const shortDate = monday.toLocaleDateString(getLocale(), { month: "short", day: "numeric" })
  return t("archive.weekLabel", { date: shortDate, num: m[2] })
}

/**
 * Returns Monday–Friday of the archive week, or null if not in archive mode.
 * The URL's `?week=` param is authoritative for archive timeline dates — the
 * data's `fetchedAt` cannot be trusted (a re-scraped archive branch or a
 * freshly-seeded local dev archive would otherwise show current-week dates).
 */
export function getArchiveWeekDates(): Date[] | null {
  const week = getArchiveWeek()
  if (!week) return null
  const monday = mondayOfIsoWeek(week)
  return monday ? getWeekDates(monday) : null
}

let _weeksCache: Promise<string[]> | null = null

export function fetchArchiveWeeks(): Promise<string[]> {
  if (_weeksCache) return _weeksCache
  _weeksCache = (async () => {
    try {
      const res = await fetch(`${config.archivePath}/index.json`)
      if (!res.ok) return []
      const data = (await res.json()) as unknown
      if (!data || typeof data !== "object") return []
      const weeks = (data as { weeks?: unknown }).weeks
      if (!Array.isArray(weeks)) return []
      return weeks.filter((w): w is string => typeof w === "string" && WEEK_RE.test(w))
    } catch {
      return []
    }
  })()
  return _weeksCache
}

export function enterArchive(week: string): void {
  window.location.assign(`?week=${week}`)
}

export function exitArchive(): void {
  window.location.assign(window.location.pathname)
}

// Test-only: resets module-private state between test cases.
export function _resetArchiveWeeksCache(): void {
  _weeksCache = null
}
