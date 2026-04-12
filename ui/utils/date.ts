import { DAYS, DAY_JS_MAP, type DayName } from "../constants"
import { getLocale, t } from '../i18n/i18n'

export function getMondayOfWeek(refDate: Date): Date {
  const monday = new Date(refDate)
  monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function getWeekDates(refDate?: Date): Date[] {
  const monday = getMondayOfWeek(refDate || new Date())
  return DAYS.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export function getLatestFetchTime(restaurants: { fetchedAt: string }[]): string | null {
  return restaurants.map((r) => r.fetchedAt).filter(Boolean).sort().pop() || null
}

export function getLatestFetchDate(restaurants: { fetchedAt: string }[]): Date | null {
  const latest = getLatestFetchTime(restaurants)
  return latest ? new Date(latest) : null
}

export function getDataWeekDates(restaurants: { fetchedAt: string }[]): Date[] {
  const fetchDate = getLatestFetchDate(restaurants)
  return getWeekDates(fetchDate && !isNaN(fetchDate.getTime()) ? fetchDate : new Date())
}

export function formatShortDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "short" })
}

export function getTodayName(): DayName | null {
  return DAY_JS_MAP[new Date().getDay()] || null
}

export function todayDayIndex(): number {
  const d = new Date().getDay()
  return d >= 1 && d <= 5 ? d - 1 : -1
}

export function isDataFromCurrentWeek(restaurants: { fetchedAt: string }[]): boolean {
  const fetchDate = getLatestFetchDate(restaurants)
  if (!fetchDate || isNaN(fetchDate.getTime())) return false
  const monday = getMondayOfWeek(new Date())
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  return fetchDate >= monday && fetchDate < nextMonday
}

export function isAvailableOnDay(restaurant: { availableDays?: readonly string[] }, day: string): boolean {
  return !restaurant.availableDays || restaurant.availableDays.includes(day)
}

export function formatAvailableDays(days: readonly string[]): string {
  return days.map(d => t(`dayShort.${d}`)).join(", ")
}
