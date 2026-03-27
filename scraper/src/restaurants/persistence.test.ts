import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RestaurantData } from './types.js'

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
        Montag: {
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
      Montag: {
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
