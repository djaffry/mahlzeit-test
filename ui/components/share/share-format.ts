import { DAYS } from "../../constants"
import { getMondayOfWeek } from "../../utils/date"
import { getLocale, t } from "../../i18n/i18n"

export function formatDayLabel(day: string): string {
  const dayIndex = DAYS.indexOf(day as typeof DAYS[number])
  if (dayIndex === -1) return day

  const monday = getMondayOfWeek(new Date())
  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIndex)

  return target.toLocaleDateString(getLocale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function formatBadges(badges: string[]): string {
  return badges.map(b => t(b)).join(' · ')
}
