export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const
export type DayName = (typeof DAYS)[number]

export const DAY_JS_MAP: Record<number, DayName> = {
  1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag",
}

export const SVG = {
  chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  selectAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13l4 4L16 7"/><path d="M8 13l4 4L22 7"/></svg>',
  fullscreen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>',
}

export type BadgeProp = 'stampCard' | 'edenred' | 'outdoor' | 'reservationUrl'

export const BADGES: readonly { prop: BadgeProp; css: string; i18n: string; color: string }[] = [
  { prop: 'stampCard',      css: 'stamp-card-badge',  i18n: 'badge.stampCard', color: 'yellow' },
  { prop: 'edenred',        css: 'edenred-badge',     i18n: 'badge.edenred',   color: 'red' },
  { prop: 'outdoor',        css: 'outdoor-badge',     i18n: 'badge.outdoor',   color: 'teal' },
  { prop: 'reservationUrl', css: 'reservation-badge', i18n: 'badge.reservationRequired', color: 'peach' },
]

export const TAG_COLORS: Record<string, string> = {
  Vegetarisch: "teal",
  Vegan: "green",
  "Meeresfrüchte": "blue",
  Fisch: "blue",
  Fleisch: "red",
  Rindfleisch: "red",
  Schweinefleisch: "red",
  Lamm: "red",
  "Geflügel": "peach",
  Huhn: "peach",
  Pute: "peach",
  Ente: "peach",
  Glutenfrei: "yellow",
  Laktosefrei: "lavender",
}

export const PALETTE = ["green", "yellow", "red", "blue", "peach", "mauve", "lavender", "teal", "flamingo"] as const
