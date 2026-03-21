import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TranslationCache } from './types.js'

const CACHE_FILENAME = '.translation-cache.json'

export function computeContentHash(days: unknown): string {
  const content = JSON.stringify(days)
  return createHash('sha256').update(content).digest('hex').substring(0, 16)
}

export async function loadCache(dataDir: string): Promise<TranslationCache> {
  try {
    const raw = await readFile(join(dataDir, CACHE_FILENAME), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function saveCache(dataDir: string, cache: TranslationCache): Promise<void> {
  await writeFile(
    join(dataDir, CACHE_FILENAME),
    JSON.stringify(cache, null, 2) + '\n',
    'utf-8'
  )
}

export function getCacheKey(restaurantId: string, targetLang: string): string {
  return `${restaurantId}_${targetLang}`
}
