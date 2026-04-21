export type GermanWeekday = 'Montag' | 'Dienstag' | 'Mittwoch' | 'Donnerstag' | 'Freitag'

export interface Restaurant {
  id: string
  title: string
  url: string
  type: "full" | "specials" | "link"
  icon?: string
  cuisine?: string[]
  coordinates?: { lat: number; lon: number }
  edenred?: boolean
  stampCard?: boolean
  outdoor?: boolean
  reservationUrl?: string
  availableDays?: GermanWeekday[]
  fetchedAt: string
  error: string | null
  days: Record<string, DayMenu>
}

export interface DayMenu {
  categories: MenuCategory[]
  fetchedAt: string
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

export interface Voter {
  color: string
  label: string
  iconSvg: string
  isSelf: boolean
}

export interface TagHierarchy {
  tags: string[]
  hierarchy: Record<string, string[]>
  aliases: Record<string, string>
}
