export interface MenuItem {
  title: string;
  price: string | null;
  tags: string[];
  allergens: string | null;
  description: string | null;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface DayMenu {
  categories: MenuCategory[];
  fetchedAt: string; // ISO-8601 timestamp of when this day's data was scraped.
}

export type Weekday = 'Montag' | 'Dienstag' | 'Mittwoch' | 'Donnerstag' | 'Freitag';

export const WEEKDAYS: Weekday[] = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** What adapters return: weekday-keyed, no per-day metadata. */
export type AdapterWeekMenu = Partial<Record<Weekday, Pick<DayMenu, 'categories'>>>;

/** What persistence writes: date-keyed (YYYY-MM-DD), with per-day `fetchedAt`. */
export type DaysByDate = Record<string, DayMenu>;

interface BaseAdapter {
  id: string;
  title: string;
  url: string;
  icon?: string;
  availableDays?: Weekday[];
  cuisine?: string[];
  stampCard?: boolean;
  edenred?: boolean;
  outdoor?: boolean;
  reservationUrl?: string;
  coordinates?: { lat: number; lon: number };
}

export interface FullAdapter extends BaseAdapter {
  type: 'full' | 'specials';
  fetchMenu: () => Promise<AdapterWeekMenu>;
}

export interface LinkAdapter extends BaseAdapter {
  type: 'link';
}

export type FetchableAdapter = FullAdapter;
export type Adapter = FullAdapter | LinkAdapter;

export function isFetchable(a: Adapter): a is FetchableAdapter {
  return typeof (a as FetchableAdapter).fetchMenu === 'function';
}

export function allDays(categories: MenuCategory[]): AdapterWeekMenu {
  const menu: AdapterWeekMenu = {};
  for (const day of WEEKDAYS) {
    menu[day] = { categories };
  }
  return menu;
}

export interface RestaurantData {
  id: string;
  title: string;
  url: string;
  type: Adapter['type'];
  icon?: string;
  availableDays?: Weekday[];
  cuisine?: string[];
  stampCard?: boolean;
  edenred?: boolean;
  outdoor?: boolean;
  reservationUrl?: string;
  coordinates?: { lat: number; lon: number };
  fetchedAt: string;
  error: string | null;
  days: DaysByDate;
}
