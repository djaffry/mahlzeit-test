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
}

export type Weekday = 'Montag' | 'Dienstag' | 'Mittwoch' | 'Donnerstag' | 'Freitag';

export const WEEKDAYS: Weekday[] = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

export type WeekMenu = Partial<Record<Weekday, DayMenu>>;

interface BaseAdapter {
  id: string;
  title: string;
  url: string;
  availableDays?: Weekday[];
}

export interface FullAdapter extends BaseAdapter {
  type: 'full';
  fetchMenu: () => Promise<WeekMenu>;
}

export interface LinkAdapter extends BaseAdapter {
  type: 'link';
}

export type Adapter = FullAdapter | LinkAdapter;

export interface RestaurantData {
  id: string;
  title: string;
  url: string;
  type: Adapter['type'];
  availableDays?: Weekday[];
  fetchedAt: string;
  error: string | null;
  days: WeekMenu;
}
