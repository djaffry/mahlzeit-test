import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Adapter, FetchableAdapter, LinkAdapter, RestaurantData } from './types.js';
import { isFetchable } from './types.js';
import {
  ensureDataDir,
  sanitizeWeekMenu,
  convertWeekMenuToDates,
  buildRestaurantData,
  saveRestaurant,
  saveManifest,
  saveTagMetadata,
  saveUnknownTags,
} from './persistence.js';
import { log } from '../log.js';
import { getTagMetadata, isKnownTag } from './tags.js';
import { currentWeek, type IsoWeek } from '../week.js';

type UnknownTagMap = Record<string, { adapter: string; example: string }>;

interface AdapterModule {
  default?: Adapter;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = join(__dirname, 'adapters');
const SCRAPE_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  const seen = new Set<object>([err]);
  let cause = err.cause;
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    parts.push(cause.message);
    cause = cause.cause;
  }
  if (cause !== undefined && !(cause instanceof Error)) {
    parts.push(String(cause));
  }
  return parts.join(' → ');
}

async function discoverAdapters(): Promise<Adapter[]> {
  const files = await readdir(ADAPTERS_DIR);
  const jsFiles = files.filter(f => f.endsWith('.js') && !f.startsWith('.'));

  const adapters: Adapter[] = [];
  for (const file of jsFiles) {
    try {
      const modulePath = pathToFileURL(join(ADAPTERS_DIR, file)).href;
      const mod: AdapterModule = await import(modulePath);
      const adapter = mod.default;
      if (!adapter?.id || !adapter?.type) {
        log('FAIL', file, 'load', 'missing id or type export');
        continue;
      }
      if (adapter.type !== 'link' && !isFetchable(adapter)) {
        log('FAIL', file, 'load', `${(adapter as { type: string }).type} adapter missing fetchMenu`);
        continue;
      }
      adapters.push(adapter);
    } catch (err) {
      log('FAIL', file, 'load', extractErrorMessage(err));
    }
  }
  return adapters;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(adapter: FetchableAdapter, scrapeStart: string, week: IsoWeek): Promise<RestaurantData> {
  let lastErrorMsg = '';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log('INFO', adapter.id, 'fetch', `retry ${attempt}/${MAX_RETRIES}`);
        await delay(RETRY_DELAY_MS);
      }
      const weekMenu = await withTimeout(adapter.fetchMenu(), SCRAPE_TIMEOUT_MS, adapter.id);
      log('OK', adapter.id, 'fetch', `${Object.keys(weekMenu).length} day(s)`);
      const sanitized = sanitizeWeekMenu(weekMenu);
      const byDate = convertWeekMenuToDates(sanitized, week, scrapeStart);
      return buildRestaurantData(adapter, byDate, null);
    } catch (err) {
      lastErrorMsg = extractErrorMessage(err);
      log('FAIL', adapter.id, 'fetch', `attempt ${attempt + 1}: ${lastErrorMsg}`);
    }
  }
  return buildRestaurantData(adapter, {}, lastErrorMsg);
}

async function scrapeFetchableAdapters(adapters: FetchableAdapter[], scrapeStart: string, week: IsoWeek): Promise<RestaurantData[]> {
  return Promise.all(
    adapters.map(async (adapter): Promise<RestaurantData> => {
      log('INFO', adapter.id, 'fetch', 'starting');
      return fetchWithRetry(adapter, scrapeStart, week);
    })
  );
}

function discoverUnknownTags(results: RestaurantData[]): UnknownTagMap {
  const found: UnknownTagMap = {};
  for (const { id, error, days } of results) {
    if (error) continue;
    const items = Object.values(days)
      .flatMap(day => day?.categories ?? [])
      .flatMap(cat => cat.items);
    for (const { title, tags } of items) {
      for (const tag of tags) {
        if (!isKnownTag(tag) && !found[tag]) {
          found[tag] = { adapter: id, example: title };
        }
      }
    }
  }
  return found;
}

export async function scrape(): Promise<void> {
  await ensureDataDir();
  const scrapeStart = new Date().toISOString();
  const week = currentWeek();

  const adapters = await discoverAdapters();
  const fetchableAdapters = adapters.filter(isFetchable);
  const linkAdapters = adapters.filter((a): a is LinkAdapter => a.type === 'link');
  log('INFO', '*', 'discover', `${adapters.length} adapter(s): ${adapters.map(a => a.id).join(', ')}`);

  const restaurantIds: string[] = [];

  const fetchableResults = await scrapeFetchableAdapters(fetchableAdapters, scrapeStart, week);
  for (const data of fetchableResults) {
    await saveRestaurant(data);
    restaurantIds.push(data.id);
  }

  for (const adapter of linkAdapters) {
    const data = buildRestaurantData(adapter, {}, null);
    await saveRestaurant(data);
    restaurantIds.push(data.id);
  }

  await saveManifest(restaurantIds);
  await saveTagMetadata(getTagMetadata());
  await saveUnknownTags(discoverUnknownTags(fetchableResults));
}
