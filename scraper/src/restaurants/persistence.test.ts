import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RestaurantData, AdapterWeekMenu } from './types.js'
import { saveRestaurant, convertWeekMenuToDates } from './persistence.js'

function makeData(overrides: Partial<RestaurantData> = {}): RestaurantData {
  return {
    id: 'testplace',
    title: 'Test Place',
    url: 'https://example.com',
    type: 'link',
    fetchedAt: new Date().toISOString(),
    error: null,
    days: {},
    ...overrides,
  }
}

function serialize(data: RestaurantData): string {
  return JSON.stringify(data, null, 2) + '\n'
}

describe('saveRestaurant skip logic', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'persistence-test-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true })
  })

  function filePath(id: string): string {
    return join(tmpDir, `${id}.json`)
  }

  async function writeExisting(data: RestaurantData): Promise<void> {
    await writeFile(filePath(data.id), serialize(data))
  }

  async function readRaw(id: string): Promise<string> {
    return readFile(filePath(id), 'utf-8')
  }

  /**
   * Replicates the core comparison from saveRestaurant:
   * JSON.stringify({ ...data, fetchedAt: existing.data.fetchedAt }, null, 2) + '\n' === existing.raw
   */
  function wouldSkip(incoming: RestaurantData, existingRaw: string, existingData: RestaurantData): boolean {
    return JSON.stringify({ ...incoming, fetchedAt: existingData.fetchedAt }, null, 2) + '\n' === existingRaw
  }

  it('skips write when only fetchedAt differs', async () => {
    const existing = makeData({ fetchedAt: '2026-03-27T10:00:00.000Z' })
    await writeExisting(existing)

    const incoming = makeData({ fetchedAt: '2026-03-27T11:00:00.000Z' })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(true)
  })

  it('does not skip when menu content changes', async () => {
    const existing = makeData({ fetchedAt: '2026-03-27T10:00:00.000Z' })
    await writeExisting(existing)

    const incoming = makeData({
      fetchedAt: '2026-03-27T11:00:00.000Z',
      days: {
        '2026-04-20': {
          fetchedAt: '2026-03-27T10:00:00.000Z',
          categories: [{
            name: 'Suppe',
            items: [{ title: 'Gulaschsuppe', price: '5,90 €', tags: [], allergens: null, description: null }],
          }],
        },
      },
    })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(false)
  })

  it('does not skip when metadata changes', async () => {
    const existing = makeData({ fetchedAt: '2026-03-27T10:00:00.000Z' })
    await writeExisting(existing)

    const incoming = makeData({
      fetchedAt: '2026-03-27T11:00:00.000Z',
      title: 'New Title',
    })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(false)
  })

  it('does not skip when error state changes', async () => {
    const existing = makeData({
      fetchedAt: '2026-03-27T10:00:00.000Z',
      error: 'timeout',
    })
    await writeExisting(existing)

    const incoming = makeData({
      fetchedAt: '2026-03-27T11:00:00.000Z',
      error: null,
    })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(false)
  })

  it('handles trailing newline correctly in round-trip', async () => {
    const data = makeData({ fetchedAt: '2026-03-27T10:00:00.000Z' })
    await writeExisting(data)
    const raw = await readRaw(data.id)

    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toBe(serialize(data))
  })

  it('skips write for link adapters with no menu data', async () => {
    const existing = makeData({
      type: 'link',
      fetchedAt: '2026-03-27T10:00:00.000Z',
      days: {},
    })
    await writeExisting(existing)

    const incoming = makeData({
      type: 'link',
      fetchedAt: '2026-03-27T11:00:00.000Z',
      days: {},
    })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(true)
  })

  it('skips write for full adapters with identical menu', async () => {
    const menu = {
      '2026-04-20': {
        fetchedAt: '2026-03-27T10:00:00.000Z',
        categories: [{
          name: 'Hauptspeise',
          items: [{ title: 'Schnitzel', price: '11,90 €', tags: ['Schweinefleisch'], allergens: 'A,C,G', description: null }],
        }],
      },
    } as RestaurantData['days']

    const existing = makeData({
      type: 'full',
      fetchedAt: '2026-03-27T10:00:00.000Z',
      days: menu,
    })
    await writeExisting(existing)

    const incoming = makeData({
      type: 'full',
      fetchedAt: '2026-03-27T11:00:00.000Z',
      days: menu,
    })
    const raw = await readRaw(existing.id)

    expect(wouldSkip(incoming, raw, existing)).toBe(true)
  })
})

describe('convertWeekMenuToDates', () => {
  it('maps adapter weekday entries to the dates of the given ISO week and stamps fetchedAt', () => {
    const menu: AdapterWeekMenu = {
      Montag: { categories: [{ name: 'Main', items: [] }] },
      Mittwoch: { categories: [{ name: 'Special', items: [] }] },
    };
    const stamp = '2026-04-20T08:25:13.000Z';
    const out = convertWeekMenuToDates(menu, { year: 2026, week: 17 }, stamp);
    expect(Object.keys(out).sort()).toEqual(['2026-04-20', '2026-04-22']);
    expect(out['2026-04-20']).toEqual({ categories: [{ name: 'Main', items: [] }], fetchedAt: stamp });
    expect(out['2026-04-22']).toEqual({ categories: [{ name: 'Special', items: [] }], fetchedAt: stamp });
  });

  it('returns an empty record for an empty menu', () => {
    expect(convertWeekMenuToDates({}, { year: 2026, week: 17 }, '2026-04-20T00:00:00Z')).toEqual({});
  });
});

describe('saveRestaurant — date-keyed merge', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'peckish-persist-'));
    process.env.PECKISH_DATA_DIR = dir;
    await mkdir(join(dir, 'de'), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.PECKISH_DATA_DIR;
  });

  function baseRestaurant(partial: Partial<RestaurantData> = {}): RestaurantData {
    return {
      id: 'demo',
      title: 'Demo',
      url: 'https://example.test',
      type: 'full',
      fetchedAt: '2026-04-21T08:00:00.000Z',
      error: null,
      days: {},
      ...partial,
    };
  }

  it('writes a new file if none exists', async () => {
    const data = baseRestaurant({
      days: {
        '2026-04-20': { categories: [{ name: 'Main', items: [] }], fetchedAt: '2026-04-20T08:00:00.000Z' },
      },
    });
    await saveRestaurant(data);
    const raw = await readFile(join(dir, 'de', 'demo.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed.days)).toEqual(['2026-04-20']);
  });

  it('merges per-date: new dates added, existing dates overwritten, unrelated dates preserved', async () => {
    await writeFile(join(dir, 'de', 'demo.json'), JSON.stringify(baseRestaurant({
      fetchedAt: '2026-04-20T08:00:00.000Z',
      days: {
        '2026-04-20': { categories: [{ name: 'Main', items: [{ title: 'Mon old', price: null, tags: [], allergens: null, description: null }] }], fetchedAt: '2026-04-20T08:00:00.000Z' },
        '2026-04-21': { categories: [{ name: 'Main', items: [{ title: 'Tue old', price: null, tags: [], allergens: null, description: null }] }], fetchedAt: '2026-04-20T08:00:00.000Z' },
      },
    })) + '\n');

    const incoming = baseRestaurant({
      fetchedAt: '2026-04-21T08:00:00.000Z',
      days: {
        '2026-04-21': { categories: [{ name: 'Main', items: [{ title: 'Tue new', price: null, tags: [], allergens: null, description: null }] }], fetchedAt: '2026-04-21T08:00:00.000Z' },
        '2026-04-22': { categories: [{ name: 'Main', items: [{ title: 'Wed new', price: null, tags: [], allergens: null, description: null }] }], fetchedAt: '2026-04-21T08:00:00.000Z' },
      },
    });
    await saveRestaurant(incoming);

    const parsed = JSON.parse(await readFile(join(dir, 'de', 'demo.json'), 'utf-8'));
    expect(Object.keys(parsed.days).sort()).toEqual(['2026-04-20', '2026-04-21', '2026-04-22']);
    expect(parsed.days['2026-04-20'].categories[0].items[0].title).toBe('Mon old');
    expect(parsed.days['2026-04-21'].categories[0].items[0].title).toBe('Tue new');
    expect(parsed.days['2026-04-22'].categories[0].items[0].title).toBe('Wed new');
  });

  it('on error, preserves existing data unchanged', async () => {
    await writeFile(join(dir, 'de', 'demo.json'), JSON.stringify(baseRestaurant({
      days: {
        '2026-04-20': { categories: [{ name: 'Main', items: [] }], fetchedAt: '2026-04-20T08:00:00.000Z' },
      },
    })) + '\n');

    const errorResult = baseRestaurant({ error: 'scrape failed', days: {} });
    await saveRestaurant(errorResult);

    const parsed = JSON.parse(await readFile(join(dir, 'de', 'demo.json'), 'utf-8'));
    expect(Object.keys(parsed.days)).toEqual(['2026-04-20']);
    expect(parsed.error).toBeNull();
  });

  it('on error with no existing file, writes a stub so the manifest entry has a file', async () => {
    // A new restaurant that failed on its first scrape still gets a file; otherwise the UI
    // would 404 on the manifest entry.
    const errorResult = baseRestaurant({ error: 'scrape failed', days: {} });
    await saveRestaurant(errorResult);

    const parsed = JSON.parse(await readFile(join(dir, 'de', 'demo.json'), 'utf-8'));
    expect(parsed.error).toBe('scrape failed');
    expect(parsed.days).toEqual({});
  });

  it('skips write when content unchanged, even though per-day fetchedAt differs', async () => {
    const baseDay = { categories: [{ name: 'Main', items: [{ title: 'Schnitzel', price: null, tags: [], allergens: null, description: null }] }] };
    // Existing must be serialized exactly the way saveRestaurant will — indented + trailing newline —
    // otherwise the skip-write comparison will fail trivially.
    const existing = baseRestaurant({
      fetchedAt: '2026-04-20T08:00:00.000Z',
      days: { '2026-04-20': { ...baseDay, fetchedAt: '2026-04-20T08:00:00.000Z' } },
    });
    await writeFile(join(dir, 'de', 'demo.json'), JSON.stringify(existing, null, 2) + '\n');

    // Incoming has same content but fresh fetchedAt stamps everywhere.
    const incoming = baseRestaurant({
      fetchedAt: '2026-04-21T08:00:00.000Z',
      days: { '2026-04-20': { ...baseDay, fetchedAt: '2026-04-21T08:00:00.000Z' } },
    });
    await saveRestaurant(incoming);

    const parsed = JSON.parse(await readFile(join(dir, 'de', 'demo.json'), 'utf-8'));
    // Existing day's fetchedAt and outer fetchedAt should be preserved (write was skipped).
    expect(parsed.days['2026-04-20'].fetchedAt).toBe('2026-04-20T08:00:00.000Z');
    expect(parsed.fetchedAt).toBe('2026-04-20T08:00:00.000Z');
  });
});
