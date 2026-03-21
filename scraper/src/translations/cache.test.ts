import { describe, it, before, after } from 'node:test'
import { strictEqual, deepStrictEqual, notStrictEqual } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeContentHash, loadCache, saveCache, getCacheKey } from './cache.js'

describe('computeContentHash', () => {
  it('returns a 16-char hex string', () => {
    const hash = computeContentHash({ Montag: { categories: [] } })
    strictEqual(hash.length, 16)
    strictEqual(/^[0-9a-f]+$/.test(hash), true)
  })

  it('returns the same hash for identical content', () => {
    const days = { Montag: { categories: [{ name: 'Suppe', items: [] }] } }
    strictEqual(computeContentHash(days), computeContentHash(days))
  })

  it('returns different hash for different content', () => {
    const a = { Montag: { categories: [{ name: 'Suppe', items: [] }] } }
    const b = { Montag: { categories: [{ name: 'Salat', items: [] }] } }
    notStrictEqual(computeContentHash(a), computeContentHash(b))
  })

  it('ignores object reference (hashes by value)', () => {
    const a = { Montag: { categories: [{ name: 'Suppe', items: [{ title: 'Gulasch' }] }] } }
    const b = JSON.parse(JSON.stringify(a))
    strictEqual(computeContentHash(a), computeContentHash(b))
  })
})

describe('getCacheKey', () => {
  it('combines restaurant id and language', () => {
    strictEqual(getCacheKey('mano', 'en'), 'mano_en')
    strictEqual(getCacheKey('reinthaler', 'fr'), 'reinthaler_fr')
  })
})

describe('loadCache / saveCache', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cache-test-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('returns empty object when cache file does not exist', async () => {
    const cache = await loadCache(tmpDir)
    deepStrictEqual(cache, {})
  })

  it('round-trips cache data through save and load', async () => {
    const data = {
      'mano_en': { hash: 'abc123' },
      'reinthaler_en': { hash: 'def456' },
    }
    await saveCache(tmpDir, data)
    const loaded = await loadCache(tmpDir)
    deepStrictEqual(loaded, data)
  })

  it('overwrites existing cache on save', async () => {
    await saveCache(tmpDir, { 'old_key': { hash: '111' } })
    await saveCache(tmpDir, { 'new_key': { hash: '222' } })
    const loaded = await loadCache(tmpDir)
    deepStrictEqual(loaded, { 'new_key': { hash: '222' } })
  })
})
