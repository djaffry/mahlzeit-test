import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { TranslationConfig, TranslationAdapter } from './types.js'

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}
import { loadCache, saveCache, computeContentHash, getCacheKey } from './cache.js'
import { log } from '../log.js'
import type { RestaurantData } from '../restaurants/types.js'

export async function runTranslation(dataDir: string, globalsDir: string, config: TranslationConfig): Promise<void> {
  const { sourceLanguage, targetLanguages, adapter } = config

  log('INFO', 'translation', 'start', `source=${sourceLanguage}, targets=[${targetLanguages.join(', ')}], adapter=${adapter.name}`)

  const indexRaw = await readFile(join(globalsDir, 'index.json'), 'utf-8')
  const restaurantIds: string[] = JSON.parse(indexRaw)

  const sourceLangDir = join(dataDir, sourceLanguage)
  const languages = [sourceLanguage, ...targetLanguages]
  await writeFile(join(globalsDir, 'languages.json'), JSON.stringify(languages) + '\n', 'utf-8')

  const cache = await loadCache(globalsDir)
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

        if (cache[cacheKey]?.hash === contentHash && await fileExists(targetFile)) {
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
    await saveCache(globalsDir, cache)
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
  const translated = structuredClone(data)

  // Collect all translatable strings, deduplicating identical ones
  // (e.g. allDays() restaurants repeat the same menu for every weekday)
  const texts: string[] = []
  for (const c of translated.cuisine ?? []) {
    texts.push(c)
  }
  for (const dayKey of Object.keys(translated.days)) {
    const day = translated.days[dayKey]
    if (!day?.categories) continue
    for (const category of day.categories) {
      texts.push(category.name)
      for (const item of category.items) {
        texts.push(item.title)
        if (item.description) texts.push(item.description)
      }
    }
  }

  const uniqueTexts = [...new Set(texts)]
  const results = await adapter.translateBatch(uniqueTexts, from, to)
  const translationMap = new Map(uniqueTexts.map((t, i) => [t, results[i]]))

  // Apply translations back using the map
  if (translated.cuisine) {
    translated.cuisine = translated.cuisine.map(c => translationMap.get(c) ?? c)
  }
  for (const dayKey of Object.keys(translated.days)) {
    const day = translated.days[dayKey]
    if (!day?.categories) continue
    for (const category of day.categories) {
      category.name = translationMap.get(category.name) ?? category.name
      for (const item of category.items) {
        item.title = translationMap.get(item.title) ?? item.title
        if (item.description) {
          item.description = translationMap.get(item.description) ?? item.description
        }
      }
    }
  }

  return translated
}
