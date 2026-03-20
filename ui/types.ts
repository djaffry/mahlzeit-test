import type { DayName } from "./constants"

export interface Restaurant {
  id: string
  title: string
  url: string
  type: "full" | "specials" | "link"
  cuisine?: string[]
  coordinates?: { lat: number; lon: number }
  edenred?: boolean
  stampCard?: boolean
  outdoor?: boolean
  reservationUrl?: string
  availableDays?: DayName[]
  fetchedAt: string
  error: string | null
  days: Record<string, DayMenu>
}

export interface DayMenu {
  categories: MenuCategory[]
}

export interface MenuCategory {
  name: string
  items: MenuItem[]
}

export interface MenuItem {
  title: string
  description: string | null
  price: string | null
  tags: string[]
  allergens: string | null
}

export interface TagHierarchy {
  tags: string[]
  hierarchy: Record<string, string[]>
  aliases: Record<string, string>
}
