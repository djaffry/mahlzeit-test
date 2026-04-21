import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { JSDOM } from 'jsdom';
import type { Adapter, RestaurantData, AdapterWeekMenu, DaysByDate, DayMenu, MenuItem } from './types.js';
import { WEEKDAYS } from './types.js';
import { log } from '../log.js';
import { SOURCE_LANGUAGE, getDataDir, getGlobalsDir } from '../config.js';
import { dateForWeekdayInIsoWeek, type IsoWeek } from '../week.js';

function restaurantDir(): string {
  return join(getDataDir(), SOURCE_LANGUAGE);
}

// jsdom doesn't run scripts without `runScripts`, so innerHTML here is safe.
const _htmlParseDoc = new JSDOM('').window.document;

function stripHtml(text: string): string {
  // Fast path for plain text — the common case for most menu fields.
  if (!text.includes('<')) return text.trim();
  const el = _htmlParseDoc.createElement('div');
  el.innerHTML = text;
  return (el.textContent ?? '').trim();
}

function sanitizeItem(item: MenuItem): MenuItem {
  return {
    title: stripHtml(item.title),
    price: item.price ? stripHtml(item.price) : null,
    tags: item.tags.map(stripHtml),
    allergens: item.allergens ? stripHtml(item.allergens) : null,
    description: item.description ? stripHtml(item.description) : null,
  };
}

export function sanitizeWeekMenu(days: AdapterWeekMenu): AdapterWeekMenu {
  const result: AdapterWeekMenu = {};
  for (const day of WEEKDAYS) {
    const menu = days[day];
    if (!menu) continue;
    result[day] = {
      categories: menu.categories.map(cat => ({
        name: stripHtml(cat.name),
        items: cat.items.map(sanitizeItem),
      })),
    };
  }
  return result;
}

/** Convert adapter's weekday-keyed output to persistent date-keyed shape. */
export function convertWeekMenuToDates(menu: AdapterWeekMenu, week: IsoWeek, fetchedAt: string): DaysByDate {
  const out: DaysByDate = {};
  for (const day of WEEKDAYS) {
    const entry = menu[day];
    if (!entry) continue;
    const date = dateForWeekdayInIsoWeek(week, day);
    out[date] = { categories: entry.categories, fetchedAt };
  }
  return out;
}

export function buildRestaurantData(adapter: Adapter, days: DaysByDate, error: string | null): RestaurantData {
  return {
    id: adapter.id,
    title: adapter.title,
    url: adapter.url,
    type: adapter.type,
    ...(adapter.icon && { icon: adapter.icon }),
    ...(adapter.availableDays && { availableDays: adapter.availableDays }),
    ...(adapter.cuisine && { cuisine: adapter.cuisine }),
    ...(adapter.stampCard && { stampCard: adapter.stampCard }),
    ...(adapter.edenred && { edenred: adapter.edenred }),
    ...(adapter.outdoor && { outdoor: adapter.outdoor }),
    ...(adapter.reservationUrl && { reservationUrl: adapter.reservationUrl }),
    ...(adapter.coordinates && { coordinates: adapter.coordinates }),
    fetchedAt: new Date().toISOString(),
    error,
    days,
  };
}

interface ExistingFile { data: RestaurantData; raw: string }

async function readExisting(id: string): Promise<ExistingFile | null> {
  try {
    const raw = await readFile(join(restaurantDir(), `${id}.json`), 'utf-8');
    return { data: JSON.parse(raw) as RestaurantData, raw };
  } catch {
    return null;
  }
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(restaurantDir(), { recursive: true });
}

function dayCategoriesEqual(a: DayMenu, b: DayMenu): boolean {
  return JSON.stringify(a.categories) === JSON.stringify(b.categories);
}

/**
 * Merge incoming days over existing days. For dates whose content is unchanged,
 * carry the existing day's `fetchedAt` through so the skip-write check can match.
 * New dates and changed dates use the incoming day's `fetchedAt`.
 */
function mergeDays(existing: DaysByDate, incoming: DaysByDate): DaysByDate {
  const merged: DaysByDate = { ...existing };
  for (const [date, incomingDay] of Object.entries(incoming)) {
    const existingDay = existing[date];
    merged[date] = existingDay && dayCategoriesEqual(existingDay, incomingDay)
      ? existingDay
      : incomingDay;
  }
  return merged;
}

export async function saveRestaurant(data: RestaurantData): Promise<void> {
  if (basename(data.id) !== data.id || data.id.includes('..')) {
    throw new Error(`Invalid restaurant ID: ${data.id}`);
  }
  const filePath = join(restaurantDir(), `${data.id}.json`);
  const existing = await readExisting(data.id);

  if (data.error && existing) {
    log('FAIL', data.id, 'save', `keeping old data (scrape failed: ${data.error})`);
    return;
  }

  let effective: RestaurantData = data;
  if (existing && !data.error) {
    effective = { ...data, days: mergeDays(existing.data.days, data.days) };

    if (JSON.stringify({ ...effective, fetchedAt: existing.data.fetchedAt }, null, 2) + '\n' === existing.raw) {
      log('IGNORE', data.id, 'save', 'no changes');
      return;
    }
  }

  await writeFile(filePath, JSON.stringify(effective, null, 2) + '\n');
  log(effective.error ? 'FAIL' : 'OK', data.id, 'save', basename(filePath));
}

export async function saveManifest(restaurantIds: string[]): Promise<void> {
  const manifestPath = join(getGlobalsDir(), 'index.json');
  await writeFile(manifestPath, JSON.stringify(restaurantIds, null, 2) + '\n');
  log('OK', '*', 'save', `index.json with ${restaurantIds.length} restaurant(s)`);
}

export async function saveTagMetadata(metadata: object): Promise<void> {
  const filePath = join(getGlobalsDir(), 'tags.json');
  await writeFile(filePath, JSON.stringify(metadata, null, 2) + '\n');
  log('OK', '*', 'save', 'tags.json');
}

export async function saveUnknownTags(unknownTags: Record<string, { adapter: string; example: string }>): Promise<void> {
  if (Object.keys(unknownTags).length === 0) return;
  const filePath = join(getGlobalsDir(), 'unknown-tags.json');

  let existing: Record<string, { adapter: string; example: string }> = {};
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    existing = parsed.tags ?? {};
  } catch { /* file doesn't exist yet */ }

  const merged = { ...existing, ...unknownTags };
  await writeFile(filePath, JSON.stringify({ tags: merged }, null, 2) + '\n');
  log('INFO', '*', 'save', `unknown-tags.json (${Object.keys(merged).length} tag(s))`);
}
