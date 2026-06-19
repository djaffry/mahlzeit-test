import { config } from "../config"
import { t } from '../i18n/i18n'
import type { Restaurant } from "../types"
import { getDataBasePath } from "../archive/archive"

export async function fetchLanguages(): Promise<string[]> {
  try {
    const res = await fetch(`${config.dataPath}/languages.json`)
    if (!res.ok) return ['de']
    return res.json() as Promise<string[]>
  } catch {
    return ['de']
  }
}

function validateRestaurant(data: unknown, id: string): Restaurant {
  const r = data as Record<string, unknown>
  if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.title !== "string" || typeof r.days !== "object") {
    throw new Error(`${id}: invalid restaurant data`)
  }
  return data as Restaurant
}

const METADATA_KEYS = ["icon", "coordinates", "availableDays", "edenred", "stampCard", "outdoor", "reservationUrl"] as const

function backfillMetadata(data: Restaurant, source: Restaurant): Restaurant {
  for (const key of METADATA_KEYS) {
    if (data[key] === undefined && source[key] !== undefined) {
      Object.assign(data, { [key]: source[key] })
    }
  }
  return data
}

async function fetchRestaurantAt(basePath: string, id: string, lang: string, sourceLang: string, bust: string, sourceData?: Restaurant): Promise<Restaurant> {
  const res = await fetch(`${basePath}/${lang}/${id}.json${bust}`)
  if (!res.ok) {
    const fallback = await fetch(`${basePath}/${sourceLang}/${id}.json${bust}`)
    if (!fallback.ok) throw new Error(`${id}: HTTP ${fallback.status}`)
    return validateRestaurant(await fallback.json(), id)
  }
  const data = validateRestaurant(await res.json(), id)
  if (lang === sourceLang || !sourceData) return data
  return backfillMetadata(data, sourceData)
}

async function fetchSourceMapAt(basePath: string, manifest: string[], sourceLang: string, bust: string): Promise<Map<string, Restaurant>> {
  const results = await Promise.all(
    manifest.map(id =>
      fetch(`${basePath}/${sourceLang}/${id}.json${bust}`)
        .then(r => r.ok ? r.json() as Promise<Restaurant> : null)
        .catch(() => null)
    )
  )
  const map = new Map<string, Restaurant>()
  for (let i = 0; i < manifest.length; i++) {
    if (results[i]) map.set(manifest[i], results[i]!)
  }
  return map
}

/**
 * Core fetch logic shared by `fetchMenuData` and `fetchMenuDataQuiet`.
 *
 * @param onFetchFail  Called when an individual restaurant fetch fails.
 *                     Return a fallback `Restaurant` to keep it in the result,
 *                     or `null` to drop it. Omit to always drop failures.
 */
async function fetchMenuDataCore(
  dataBasePath: string,
  lang: string,
  sourceLang: string,
  bust: string,
  onFetchFail?: (id: string) => Restaurant | null,
): Promise<Restaurant[]> {
  // Manifest always lives at the globals location — archive weeks don't ship index.json.
  const manifestRes = await fetch(`${config.dataPath}/index.json${bust}`)
  if (!manifestRes.ok) {
    throw new Error(`${t("error.notFound")} (HTTP ${manifestRes.status})`)
  }
  const manifest: string[] = await manifestRes.json()

  if (lang === sourceLang) {
    const results = await Promise.allSettled(
      manifest.map(id => fetchRestaurantAt(dataBasePath, id, lang, sourceLang, bust))
    )
    return results
      .map((r, i) => r.status === "fulfilled" ? r.value : onFetchFail?.(manifest[i]) ?? null)
      .filter((r): r is Restaurant => r !== null)
  }

  const [sourceMap, results] = await Promise.all([
    fetchSourceMapAt(dataBasePath, manifest, sourceLang, bust),
    Promise.allSettled(
      manifest.map(id => fetchRestaurantAt(dataBasePath, id, lang, sourceLang, bust))
    ),
  ])
  return results
    .map((r, i) => {
      const isFresh = r.status === "fulfilled"
      const data = isFresh ? r.value : onFetchFail?.(manifest[i]) ?? null
      if (!data) return null
      const source = sourceMap.get(manifest[i])
      // Clone fallback data before mutation — fresh fetches are already unique objects.
      return source ? backfillMetadata(isFresh ? data : { ...data }, source) : data
    })
    .filter((r): r is Restaurant => r !== null)
}

export function fetchMenuData(lang: string, sourceLang: string): Promise<Restaurant[]> {
  return fetchMenuDataCore(getDataBasePath(), lang, sourceLang, "")
}

export async function fetchMenuDataQuiet(
  currentRestaurants: Restaurant[],
  lang: string,
  sourceLang: string
): Promise<Restaurant[] | null> {
  try {
    const bust = `?_=${Date.now()}`
    const fallback = (id: string) => currentRestaurants.find(o => o.id === id) ?? null
    const restaurants = await fetchMenuDataCore(config.dataPath, lang, sourceLang, bust, fallback)
    return restaurants.length > 0 ? restaurants : null
  } catch {
    return null
  }
}
