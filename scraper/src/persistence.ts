import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Adapter, RestaurantData, WeekMenu, MenuItem } from './types.js';
import { WEEKDAYS } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'data');

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
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

export function sanitizeWeekMenu(days: WeekMenu): WeekMenu {
  const result: WeekMenu = {};
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

export function buildRestaurantData(adapter: Adapter, days: WeekMenu, error: string | null): RestaurantData {
  return {
    id: adapter.id,
    title: adapter.title,
    url: adapter.url,
    type: adapter.type,
    ...(adapter.availableDays && { availableDays: adapter.availableDays }),
    fetchedAt: new Date().toISOString(),
    error,
    days,
  };
}

function isSameWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return date >= monday && date < nextMonday;
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function readExisting(id: string): Promise<RestaurantData | null> {
  try {
    const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(raw) as RestaurantData;
  } catch {
    return null;
  }
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function saveRestaurant(data: RestaurantData): Promise<void> {
  const filePath = join(DATA_DIR, `${data.id}.json`);

  if (data.error) {
    if (await fileExists(filePath)) {
      console.warn(`[${data.id}] Keeping old data (scrape failed: ${data.error})`);
      return;
    }
  } else {
    const existing = await readExisting(data.id);
    if (existing && !existing.error && isSameWeek(existing.fetchedAt)) {
      data.days = { ...existing.days, ...data.days };
    }
  }

  await writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`[${data.id}] Wrote ${basename(filePath)}`);
}

export async function saveManifest(restaurantIds: string[]): Promise<void> {
  const manifestPath = join(DATA_DIR, 'index.json');
  await writeFile(manifestPath, JSON.stringify(restaurantIds, null, 2));
  console.log(`\nWrote data/index.json with ${restaurantIds.length} restaurant(s)`);
}
