import { readFile, writeFile, mkdir, copyFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { TranslationConfig, TranslationAdapter } from './types.js'
import { loadCache, saveCache, computeContentHash, getCacheKey } from './cache.js'
import { log } from '../log.js'
import type { RestaurantData, Weekday } from '../restaurants/types.js'

export async function runTranslation(dataDir: string, config: TranslationConfig): Promise<void> {
  const { sourceLanguage, targetLanguages, adapter } = config

  log('INFO', 'translation', 'start', `source=${sourceLanguage}, targets=[${targetLanguages.join(', ')}], adapter=${adapter.name}`)

  const indexRaw = await readFile(join(dataDir, 'index.json'), 'utf-8')
  const restaurantIds: string[] = JSON.parse(indexRaw)

  const sourceLangDir = join(dataDir, sourceLanguage)
  await mkdir(sourceLangDir, { recursive: true })

  for (const id of restaurantIds) {
    const flatPath = join(dataDir, `${id}.json`)
    if (existsSync(flatPath)) {
      await copyFile(flatPath, join(sourceLangDir, `${id}.json`))
    }
  }

  const languages = [sourceLanguage, ...targetLanguages]
  await writeFile(join(dataDir, 'languages.json'), JSON.stringify(languages) + '\n', 'utf-8')

  const cache = await loadCache(dataDir)
  const failures: string[] = []

  for (const targetLang of targetLanguages) {
    const targetDir = join(dataDir, targetLang)
    await mkdir(targetDir, { recursive: true })

    for (const id of restaurantIds) {
      try {
        const sourceFile = join(sourceLangDir, `${id}.json`)
        const raw = await readFile(sourceFile, 'utf-8')
        const data: RestaurantData = JSON.parse(raw)

        const contentHash = computeContentHash(data.days)
        const cacheKey = getCacheKey(id, targetLang)
        const targetFile = join(targetDir, `${id}.json`)

        if (cache[cacheKey]?.hash === contentHash && existsSync(targetFile)) {
          log('OK', id, 'translate', `[${targetLang}] cached`)
          continue
        }

        const translated = await translateRestaurant(data, adapter, sourceLanguage, targetLang)
        await writeFile(targetFile, JSON.stringify(translated, null, 2) + '\n', 'utf-8')
        cache[cacheKey] = { hash: contentHash }
        log('OK', id, 'translate', `[${targetLang}] translated`)
      } catch (error) {
        log('FAIL', id, 'translate', `[${targetLang}] ${error}`)
        failures.push(`${targetLang}/${id}`)

        try {
          await copyFile(join(sourceLangDir, `${id}.json`), join(targetDir, `${id}.json`))
        } catch (copyError) {
          log('FAIL', id, 'translate', `[${targetLang}] fallback copy failed: ${copyError}`)
        }
      }
    }
    await saveCache(dataDir, cache)
  }

  for (const id of restaurantIds) {
    const flatPath = join(dataDir, `${id}.json`)
    if (existsSync(flatPath)) {
      await unlink(flatPath)
    }
  }

  if (failures.length > 0) {
    log('FAIL', 'translation', 'done', `${failures.length} failure(s): ${failures.join(', ')}`)
  } else {
    log('OK', 'translation', 'done', `${restaurantIds.length} restaurants`)
  }
}

async function translateRestaurant(
  data: RestaurantData,
  adapter: TranslationAdapter,
  from: string,
  to: string,
): Promise<RestaurantData> {
  const translated = JSON.parse(JSON.stringify(data)) as RestaurantData

  // Collect ALL translatable strings for the entire restaurant in one pass
  const texts: string[] = []
  const cuisineCount = translated.cuisine?.length ?? 0
  for (const c of translated.cuisine ?? []) {
    texts.push(c)
  }
  for (const dayKey of (Object.keys(translated.days) as Weekday[])) {
    const day = translated.days[dayKey]
    if (!day?.categories) continue
    for (const category of day.categories) {
      texts.push(category.name)
      for (const item of category.items) {
        texts.push(item.title)
        texts.push(item.description ?? '')
      }
    }
  }

  // Single batch call for the whole restaurant
  const results = await adapter.translateBatch(texts, from, to)

  // Apply results back in the same order
  let idx = 0
  if (translated.cuisine) {
    translated.cuisine = results.slice(0, cuisineCount)
    idx = cuisineCount
  }
  for (const dayKey of (Object.keys(translated.days) as Weekday[])) {
    const day = translated.days[dayKey]
    if (!day?.categories) continue
    for (const category of day.categories) {
      category.name = results[idx++]
      for (const item of category.items) {
        item.title = results[idx++]
        const desc = results[idx++]
        item.description = desc || item.description
      }
    }
  }

  return translated
}
