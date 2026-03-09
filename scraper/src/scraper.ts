import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Adapter, FullAdapter, LinkAdapter, RestaurantData } from './types.js';
import { ensureDataDir, sanitizeWeekMenu, buildRestaurantData, saveRestaurant, saveManifest, saveTagMetadata, saveUnknownTags } from './persistence.js';
import { log } from './log.js';
import { getTagMetadata, isKnownTag } from './tags.js';

type UnknownTagMap = Record<string, { adapter: string; example: string }>;

interface AdapterModule {
  default?: Adapter;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = join(__dirname, 'adapters');
const SCRAPE_TIMEOUT_MS = 30_000;


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
      if (adapter.type === 'full' && typeof adapter.fetchMenu !== 'function') {
        log('FAIL', file, 'load', 'full adapter missing fetchMenu');
        continue;
      }
      adapters.push(adapter);
    } catch (err) {
      log('FAIL', file, 'load', err instanceof Error ? err.message : String(err));
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

async function scrapeFullAdapters(adapters: FullAdapter[]): Promise<RestaurantData[]> {
  const results = await Promise.allSettled(
    adapters.map(async (adapter): Promise<RestaurantData> => {
      log('INFO', adapter.id, 'fetch', 'starting');
      const days = await withTimeout(adapter.fetchMenu(), SCRAPE_TIMEOUT_MS, adapter.id);
      log('OK', adapter.id, 'fetch', `${Object.keys(days).length} day(s)`);
      return buildRestaurantData(adapter, sanitizeWeekMenu(days), null);
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;

    const adapter = adapters[i];
    const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    log('FAIL', adapter.id, 'fetch', errorMsg);
    return buildRestaurantData(adapter, {}, errorMsg);
  });
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

async function main(): Promise<void> {
  await ensureDataDir();

  const adapters = await discoverAdapters();
  const fullAdapters = adapters.filter((a): a is FullAdapter => a.type === 'full');
  const linkAdapters = adapters.filter((a): a is LinkAdapter => a.type === 'link');
  log('INFO', '*', 'discover', `${adapters.length} adapter(s): ${adapters.map(a => a.id).join(', ')}`);

  const restaurantIds: string[] = [];

  const fullResults = await scrapeFullAdapters(fullAdapters);
  for (const data of fullResults) {
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
  await saveUnknownTags(discoverUnknownTags(fullResults));
}

main().catch(err => {
  log('FAIL', '*', 'fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
