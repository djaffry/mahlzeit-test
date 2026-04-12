import { config } from "../config"
import { t } from '../i18n/i18n'
import type { Restaurant } from "../types"

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

/** Static metadata fields that translations may omit */
const METADATA_KEYS = ["icon", "coordinates", "availableDays", "edenred", "stampCard", "outdoor", "reservationUrl"] as const

function backfillMetadata(data: Restaurant, source: Restaurant): Restaurant {
  for (const key of METADATA_KEYS) {
    if (data[key] === undefined && source[key] !== undefined) {
      ;(data as unknown as Record<string, unknown>)[key] = source[key]
    }
  }
  return data
}

async function fetchRestaurant(id: string, lang: string, sourceLang: string, bust: string, sourceData?: Restaurant): Promise<Restaurant> {
  const res = await fetch(`${config.dataPath}/${lang}/${id}.json${bust}`)
  if (!res.ok) {
    const fallback = await fetch(`${config.dataPath}/${sourceLang}/${id}.json${bust}`)
    if (!fallback.ok) throw new Error(`${id}: HTTP ${fallback.status}`)
    return validateRestaurant(await fallback.json(), id)
  }
  const data = validateRestaurant(await res.json(), id)
  if (lang === sourceLang || !sourceData) return data
  return backfillMetadata(data, sourceData)
}

async function fetchSourceMap(manifest: string[], sourceLang: string, bust: string): Promise<Map<string, Restaurant>> {
  const results = await Promise.all(
    manifest.map(id =>
      fetch(`${config.dataPath}/${sourceLang}/${id}.json${bust}`)
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

export async function fetchMenuData(lang: string, sourceLang: string): Promise<Restaurant[]> {
  const manifestRes = await fetch(`${config.dataPath}/index.json`)
  if (!manifestRes.ok) {
    throw new Error(`${t("error.notFound")} (HTTP ${manifestRes.status})`)
  }
  const manifest: string[] = await manifestRes.json()

  if (lang === sourceLang) {
    return Promise.all(manifest.map((id) => fetchRestaurant(id, lang, sourceLang, "")))
  }

  const [sourceMap, translated] = await Promise.all([
    fetchSourceMap(manifest, sourceLang, ""),
    Promise.all(manifest.map((id) => fetchRestaurant(id, lang, sourceLang, ""))),
  ])
  return translated.map((data, i) => {
    const source = sourceMap.get(manifest[i])
    return source ? backfillMetadata(data, source) : data
  })
}

export async function fetchMenuDataQuiet(
  currentRestaurants: Restaurant[],
  lang: string,
  sourceLang: string
): Promise<Restaurant[] | null> {
  try {
    const bust = `?_=${Date.now()}`
    const manifestRes = await fetch(`${config.dataPath}/index.json${bust}`)
    if (!manifestRes.ok) return null
    const manifest: string[] = await manifestRes.json()

    let restaurants: Restaurant[]
    if (lang === sourceLang) {
      const results = await Promise.allSettled(
        manifest.map((id) => fetchRestaurant(id, lang, sourceLang, bust))
      )
      restaurants = results
        .map((r, i) => r.status === "fulfilled" ? r.value : currentRestaurants.find((o) => o.id === manifest[i]) || null)
        .filter((r): r is Restaurant => r !== null)
    } else {
      const [sourceMap, results] = await Promise.all([
        fetchSourceMap(manifest, sourceLang, bust),
        Promise.allSettled(manifest.map((id) => fetchRestaurant(id, lang, sourceLang, bust))),
      ])
      restaurants = results
        .map((r, i) => {
          const data = r.status === "fulfilled" ? r.value : currentRestaurants.find((o) => o.id === manifest[i]) || null
          if (!data) return null
          const source = sourceMap.get(manifest[i])
          return source ? backfillMetadata({ ...data }, source) : data
        })
        .filter((r): r is Restaurant => r !== null)
    }

    return restaurants.length > 0 ? restaurants : null
  } catch {
    return null
  }
}
