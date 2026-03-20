import { config } from "../config"
import type { Restaurant } from "../types"

export async function fetchMenuData(): Promise<Restaurant[]> {
  const manifestRes = await fetch(`${config.dataPath}/index.json`)
  if (!manifestRes.ok) {
    throw new Error(`Menüdaten nicht gefunden (HTTP ${manifestRes.status})`)
  }
  const manifest: string[] = await manifestRes.json()

  return Promise.all(
    manifest.map(async (id) => {
      const res = await fetch(`${config.dataPath}/${id}.json`)
      if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
      return res.json() as Promise<Restaurant>
    })
  )
}

export async function fetchMenuDataQuiet(
  currentRestaurants: Restaurant[]
): Promise<Restaurant[] | null> {
  try {
    const bust = `?_=${Date.now()}`
    const manifestRes = await fetch(`${config.dataPath}/index.json${bust}`)
    if (!manifestRes.ok) return null
    const manifest: string[] = await manifestRes.json()

    const results = await Promise.allSettled(
      manifest.map(async (id) => {
        const res = await fetch(`${config.dataPath}/${id}.json${bust}`)
        if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
        return res.json() as Promise<Restaurant>
      })
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
