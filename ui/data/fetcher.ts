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

async function fetchRestaurant(id: string, lang: string, sourceLang: string, bust = ""): Promise<Restaurant> {
  const res = await fetch(`${config.dataPath}/${lang}/${id}.json${bust}`)
  if (res.ok) return res.json() as Promise<Restaurant>
  const fallback = await fetch(`${config.dataPath}/${sourceLang}/${id}.json${bust}`)
  if (!fallback.ok) throw new Error(`${id}: HTTP ${fallback.status}`)
  return fallback.json() as Promise<Restaurant>
}

export async function fetchMenuData(lang: string, sourceLang: string): Promise<Restaurant[]> {
  const manifestRes = await fetch(`${config.dataPath}/index.json`)
  if (!manifestRes.ok) {
    throw new Error(`${t("error.notFound")} (HTTP ${manifestRes.status})`)
  }
  const manifest: string[] = await manifestRes.json()

  return Promise.all(manifest.map((id) => fetchRestaurant(id, lang, sourceLang)))
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

    const results = await Promise.allSettled(
      manifest.map((id) => fetchRestaurant(id, lang, sourceLang, bust))
    )

    const merged = results
      .map((r, i) => {
        if (r.status === "fulfilled") return r.value
        return currentRestaurants.find((o) => o.id === manifest[i]) || null
      })
      .filter((r): r is Restaurant => r !== null)

    return merged.length > 0 ? merged : null
  } catch {
    return null
  }
}
