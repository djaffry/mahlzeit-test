export const LANG_CHANGE_EVENT = "peckish:langchange"

export const DESKTOP_MIN_WIDTH = 1025

export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const
export type DayName = (typeof DAYS)[number]

export const DAY_JS_MAP: Record<number, DayName> = {
  1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag",
}

export type BadgeProp = "stampCard" | "edenred" | "outdoor" | "reservationUrl"

export const BADGES: { prop: BadgeProp; i18n: string; cssVar: string }[] = [
  { prop: "edenred", i18n: "badge.edenred", cssVar: "--tag-red" },
  { prop: "stampCard", i18n: "badge.stampCard", cssVar: "--tag-lavender" },
  { prop: "outdoor", i18n: "badge.outdoor", cssVar: "--tag-teal" },
  { prop: "reservationUrl", i18n: "badge.reservationRequired", cssVar: "--tag-peach" },
]

export const TAG_COLORS: Record<string, string> = {
  vegan: "--tag-green",
  vegetarian: "--tag-green",
  vegetarisch: "--tag-green",
  seafood: "--tag-blue",
  "meeresfrüchte": "--tag-blue",
  fish: "--tag-blue",
  fisch: "--tag-blue",
  meat: "--tag-red",
  fleisch: "--tag-red",
  beef: "--tag-red",
  rindfleisch: "--tag-red",
  pork: "--tag-red",
  schweinefleisch: "--tag-red",
  lamb: "--tag-red",
  lamm: "--tag-red",
  poultry: "--tag-peach",
  "geflügel": "--tag-peach",
  huhn: "--tag-peach",
  pute: "--tag-peach",
  ente: "--tag-peach",
  "lactose-free": "--tag-lavender",
  laktosefrei: "--tag-lavender",
  "gluten-free": "--tag-yellow",
  glutenfrei: "--tag-yellow",
}
