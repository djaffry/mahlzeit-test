import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Adapter, FullAdapter, LinkAdapter, RestaurantData } from './types.js';
import { ensureDataDir, sanitizeWeekMenu, buildRestaurantData, saveRestaurant, saveManifest } from './persistence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = join(__dirname, 'adapters');

const SCRAPE_TIMEOUT_MS = 30_000;

interface AdapterModule {
  default?: Adapter;
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
        console.warn(`Skipping ${file}: missing id or type export`);
        continue;
      }
      if (adapter.type === 'full' && typeof adapter.fetchMenu !== 'function') {
        console.warn(`Skipping ${file}: full adapter missing fetchMenu`);
        continue;
      }
      adapters.push(adapter);
    } catch (err) {
      console.error(`Failed to load adapter ${file}:`, err);
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
      console.log(`[${adapter.id}] Fetching...`);
      const days = await withTimeout(adapter.fetchMenu(), SCRAPE_TIMEOUT_MS, adapter.id);
      console.log(`[${adapter.id}] OK: ${Object.keys(days).length} day(s)`);
      return buildRestaurantData(adapter, sanitizeWeekMenu(days), null);
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;

    const adapter = adapters[i];
    const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(`[${adapter.id}] FAILED: ${errorMsg}`);
    return buildRestaurantData(adapter, {}, errorMsg);
  });
}

async function main(): Promise<void> {
  await ensureDataDir();

  const adapters = await discoverAdapters();
  const fullAdapters = adapters.filter((a): a is FullAdapter => a.type === 'full');
  const linkAdapters = adapters.filter((a): a is LinkAdapter => a.type === 'link');
  console.log(`Discovered ${adapters.length} adapter(s): ${adapters.map(a => a.id).join(', ')}`);

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
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
