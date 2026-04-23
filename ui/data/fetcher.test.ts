import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMenuData, fetchMenuDataQuiet, fetchLanguages } from './fetcher'
import type { Restaurant } from '../types'
import { config } from "../config"

const makeRestaurant = (id: string): Restaurant => ({
  id,
  title: `Restaurant ${id}`,
  url: `https://example.com/${id}`,
  type: 'full',
  fetchedAt: '2026-03-20T10:00:00Z',
  error: null,
  days: {},
})

const r1 = makeRestaurant('r1')
const r2 = makeRestaurant('r2')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchMenuData', () => {
  it('fetches index.json then each restaurant JSON in parallel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('index.json')) {
        return { ok: true, json: async () => ['r1', 'r2'] }
      }
      if (url.includes('r1.json')) {
        return { ok: true, json: async () => r1 }
      }
      if (url.includes('r2.json')) {
        return { ok: true, json: async () => r2 }
      }
      return { ok: false, status: 404 }
    }))

    const result = await fetchMenuData('de', 'de')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('r1')
    expect(result[1].id).toBe('r2')

    const fetchMock = vi.mocked(fetch)
    // index.json + r1.json + r2.json = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toMatch(/index\.json$/)
  })

  it('throws when index.json returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => {
      return { ok: false, status: 503 }
    }))

    await expect(fetchMenuData('de', 'de')).rejects.toThrow('503')
  })

  it("filters out restaurants whose JSON returns non-ok response", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('index.json')) {
        return { ok: true, json: async () => ['r1', 'r2'] }
      }
      if (url.includes('r1.json')) {
        return { ok: true, json: async () => r1 }
      }
      // r2 fetches 404 for both target and source lang
      return { ok: false, status: 404 }
    }))

    const result = await fetchMenuData('de', 'de')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })
})

describe('fetchLanguages', () => {
  it('returns language array on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ['de', 'en'],
    })))

    const result = await fetchLanguages()
    expect(result).toEqual(['de', 'en'])
  })

  it('falls back to ["de"] when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
    })))

    const result = await fetchLanguages()
    expect(result).toEqual(['de'])
  })

  it('falls back to ["de"] on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network failure')
    }))

    const result = await fetchLanguages()
    expect(result).toEqual(['de'])
  })
})

describe('fetchMenuDataQuiet', () => {
  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => {
      throw new Error('Network failure')
    }))

    const result = await fetchMenuDataQuiet([r1, r2], 'de', 'de')
    expect(result).toBeNull()
  })

  it('returns null when index.json is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => {
      return { ok: false, status: 503 }
    }))

    const result = await fetchMenuDataQuiet([r1, r2], 'de', 'de')
    expect(result).toBeNull()
  })

  it('falls back to current restaurant data when individual fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('index.json')) {
        return { ok: true, json: async () => ['r1', 'r2'] }
      }
      if (url.includes('r1.json')) {
        return { ok: true, json: async () => r1 }
      }
      // r2.json fails
      return { ok: false, status: 500 }
    }))

    const result = await fetchMenuDataQuiet([r1, r2], 'de', 'de')

    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    // r1 came from fresh fetch, r2 fell back to currentRestaurants
    expect(result![0].id).toBe('r1')
    expect(result![1].id).toBe('r2')
  })

  it('returns merged data on partial success', async () => {
    const r1Fresh = { ...r1, fetchedAt: '2026-03-20T12:00:00Z' }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('index.json')) {
        return { ok: true, json: async () => ['r1', 'r2'] }
      }
      if (url.includes('r1.json')) {
        return { ok: true, json: async () => r1Fresh }
      }
      // r2 fails - falls back to currentRestaurants
      return { ok: false, status: 404 }
    }))

    const result = await fetchMenuDataQuiet([r1, r2], 'de', 'de')

    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    // r1 should be the freshly fetched version
    expect(result![0].fetchedAt).toBe('2026-03-20T12:00:00Z')
    // r2 is the fallback from currentRestaurants
    expect(result![1].id).toBe('r2')
  })
})

describe("fetchMenuData in archive mode", () => {
  const originalLocation = window.location

  afterEach(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true })
  })

  it("fetches manifest from dataPath and per-restaurant JSONs from archivePath/week", async () => {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, search: "?week=2026-W15", pathname: "/" },
      writable: true,
    })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("index.json")) return { ok: true, json: async () => ["r1"] }
      return { ok: true, json: async () => r1 }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchMenuData("de", "de")

    expect(result).toHaveLength(1)
    const urls = fetchMock.mock.calls.map(c => c[0] as string)
    // Manifest always from dataPath
    expect(urls.some(u => u.startsWith(config.dataPath) && u.endsWith("index.json"))).toBe(true)
    // Per-restaurant from archivePath/week
    expect(urls.some(u => u.includes(`${config.archivePath}/2026-W15/de/r1.json`))).toBe(true)
  })

  it("filters restaurants that exist in the current manifest but are missing from the archive", async () => {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, search: "?week=2026-W15", pathname: "/" },
      writable: true,
    })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("index.json")) return { ok: true, json: async () => ["r1", "new_restaurant"] }
      if (url.includes("r1.json")) return { ok: true, json: async () => r1 }
      // new_restaurant was added after the archive week — both langs 404
      return { ok: false, status: 404 }
    }))

    const result = await fetchMenuData("de", "de")
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("r1")
  })
})

