export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const
export type DayName = (typeof DAYS)[number]

export const DAY_SHORT: Record<string, string> = {
  Montag: "Mo", Dienstag: "Di", Mittwoch: "Mi", Donnerstag: "Do", Freitag: "Fr",
}

export const DAY_JS_MAP: Record<number, DayName> = {
  1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag",
}

export const SVG = {
  collapse: '<svg class="restaurant-collapse-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
}

export const TAG_COLORS: Record<string, string> = {
  Vegan: "green",
  Vegetarisch: "teal",
  "Meeresfrüchte": "blue",
  Fisch: "blue",
  "Geflügel": "peach",
  Huhn: "peach",
  Pute: "peach",
  Ente: "peach",
  Fleisch: "red",
  Lamm: "red",
  Schweinefleisch: "red",
  Rindfleisch: "red",
  Glutenfrei: "yellow",
  Laktosefrei: "lavender",
}

export const PALETTE = ["green", "yellow", "red", "blue", "peach", "mauve", "lavender", "teal", "flamingo"] as const
