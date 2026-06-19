import { getLocale, t } from '../i18n/i18n';

const GERMAN_WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;

export function getMondayOfWeek(refDate: Date): Date {
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekDates(refDate?: Date): Date[] {
  const monday = getMondayOfWeek(refDate || new Date());
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

export function weekdayOfIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return GERMAN_WEEKDAYS[date.getDay()];
}

export function isoToWeekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow >= 1 && dow <= 5 ? dow - 1 : -1;
}

export function isWeekend(iso: string): boolean {
  return isoToWeekdayIndex(iso) === -1;
}

export function todayIndexInWeek(weekDates: Date[], todayIso: string): number {
  return weekDates.findIndex(d => dateToIso(d) === todayIso);
}

export function getLatestFetchTime(restaurants: { fetchedAt: string }[]): string | null {
  return restaurants.map(r => r.fetchedAt).filter(Boolean).sort().pop() || null;
}

export function getLatestFetchDate(restaurants: { fetchedAt: string }[]): Date | null {
  const latest = getLatestFetchTime(restaurants);
  return latest ? new Date(latest) : null;
}

export function getDataWeekDates(restaurants: { fetchedAt: string }[]): Date[] {
  const fetchDate = getLatestFetchDate(restaurants);
  return getWeekDates(fetchDate && !isNaN(fetchDate.getTime()) ? fetchDate : new Date());
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
}

export function isAvailableOnDay(
  restaurant: { availableDays?: readonly string[] },
  isoDate: string,
): boolean {
  if (!restaurant.availableDays) return true;
  return restaurant.availableDays.includes(weekdayOfIsoDate(isoDate));
}

export function formatAvailableDays(days: readonly string[]): string {
  return days.map(d => t(`dayShort.${d}`)).join(', ');
}

export function isDataFromCurrentWeek(restaurants: { fetchedAt: string }[]): boolean {
  const fetchDate = getLatestFetchDate(restaurants);
  if (!fetchDate || isNaN(fetchDate.getTime())) return false;
  const [monday, nextMonday] = currentWeekBounds();
  return fetchDate >= monday && fetchDate < nextMonday;
}

function currentWeekBounds(): [Date, Date] {
  const monday = getMondayOfWeek(new Date());
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return [monday, nextMonday];
}

function isInCurrentWeek(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const [monday, nextMonday] = currentWeekBounds();
  return d >= monday && d < nextMonday;
}

/**
 * Determines if a restaurant's data is "fresh" (i.e. has been scraped this ISO week).
 *
 * The scraper only updates `fetchedAt` when content changes. A restaurant scraped
 * Monday whose menu hasn't changed still has Monday's `fetchedAt` — but it's still
 * fresh because the CI checked it. The rule: fetchedAt within the current week = fresh.
 */
export function isRestaurantFresh(restaurant: { fetchedAt: string; days?: Record<string, { fetchedAt: string }> }): boolean {
  if (isInCurrentWeek(restaurant.fetchedAt)) return true;
  if (restaurant.days) {
    for (const day of Object.values(restaurant.days)) {
      if (day?.fetchedAt && isInCurrentWeek(day.fetchedAt)) return true;
    }
  }
  return false;
}

/**
 * Returns the most recent fetchedAt across the restaurant and its days.
 */
export function getRestaurantLastUpdated(restaurant: { fetchedAt: string; days?: Record<string, { fetchedAt: string }> }): Date | null {
  let latest = restaurant.fetchedAt ? new Date(restaurant.fetchedAt) : null;
  if (latest && isNaN(latest.getTime())) latest = null;

  if (restaurant.days) {
    for (const day of Object.values(restaurant.days)) {
      if (!day?.fetchedAt) continue;
      const d = new Date(day.fetchedAt);
      if (!isNaN(d.getTime()) && (!latest || d > latest)) {
        latest = d;
      }
    }
  }

  return latest;
}

