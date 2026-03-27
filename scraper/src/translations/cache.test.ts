import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeContentHash, loadCache, saveCache, getCacheKey } from './cache.js'

describe('computeContentHash', () => {
  it('returns a 16-char hex string', () => {
    const hash = computeContentHash({ Montag: { categories: [] } })
    expect(hash).toHaveLength(16)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  it('returns the same hash for identical content', () => {
    const days = { Montag: { categories: [{ name: 'Suppe', items: [] }] } }
    expect(computeContentHash(days)).toBe(computeContentHash(days))
  })

  it('returns different hash for different content', () => {
    const a = { Montag: { categories: [{ name: 'Suppe', items: [] }] } }
    const b = { Montag: { categories: [{ name: 'Salat', items: [] }] } }
    expect(computeContentHash(a)).not.toBe(computeContentHash(b))
  })

  it('ignores object reference (hashes by value)', () => {
    const a = { Montag: { categories: [{ name: 'Suppe', items: [{ title: 'Gulasch' }] }] } }
    const b = JSON.parse(JSON.stringify(a))
    expect(computeContentHash(a)).toBe(computeContentHash(b))
  })
})

describe('getCacheKey', () => {
  it('combines restaurant id and language', () => {
    expect(getCacheKey('mano', 'en')).toBe('mano_en')
    expect(getCacheKey('reinthaler', 'fr')).toBe('reinthaler_fr')
  })
})

describe('loadCache / saveCache', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cache-test-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('returns empty object when cache file does not exist', async () => {
    const cache = await loadCache(tmpDir)
    expect(cache).toEqual({})
  })

  it('round-trips cache data through save and load', async () => {
    const data = {
      'mano_en': { hash: 'abc123' },
      'reinthaler_en': { hash: 'def456' },
    }
    await saveCache(tmpDir, data)
    const loaded = await loadCache(tmpDir)
    expect(loaded).toEqual(data)
  })

  it('overwrites existing cache on save', async () => {
    await saveCache(tmpDir, { 'old_key': { hash: '111' } })
    await saveCache(tmpDir, { 'new_key': { hash: '222' } })
    const loaded = await loadCache(tmpDir)
    expect(loaded).toEqual({ 'new_key': { hash: '222' } })
  })
})
