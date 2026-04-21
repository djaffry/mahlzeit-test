import appConfigRaw from "../data/config.json"

export interface AppConfig {
  timezone: string
  archiveWeeks: number
}

// Keep shape in sync with scraper/src/config.ts (separate tsconfigs, can't share).
function validate(c: unknown): AppConfig {
  const { timezone, archiveWeeks } = c as Partial<AppConfig>
  if (typeof timezone !== "string" || !timezone) {
    throw new Error("data/config.json: .timezone must be a non-empty string")
  }
  if (typeof archiveWeeks !== "number" || !Number.isInteger(archiveWeeks) || archiveWeeks < 0) {
    throw new Error("data/config.json: .archiveWeeks must be a non-negative integer")
  }
  return { timezone, archiveWeeks }
}

export const appConfig: AppConfig = validate(appConfigRaw)

// en-CA produces YYYY-MM-DD.
const _fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: appConfig.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function todayIso(now: Date = new Date()): string {
  return _fmt.format(now)
}
