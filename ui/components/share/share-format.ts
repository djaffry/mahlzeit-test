import { weekdayOfIsoDate } from "../../utils/date"
import { t } from "../../i18n/i18n"

export function formatDayLabel(dateIso: string): string {
  if (!dateIso) return ''
  const weekday = weekdayOfIsoDate(dateIso)
  return t(`dayShort.${weekday}`)
}

export function formatBadges(badges: string[]): string {
  return badges.map(b => t(b)).join(' · ')
}
