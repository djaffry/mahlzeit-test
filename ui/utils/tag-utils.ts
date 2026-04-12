import { TAG_COLORS } from "../constants"
import type { TagHierarchy, Restaurant } from "../types"

let _hierarchy: Record<string, string[]> = {}
let _loaded = false

export async function loadTagsFromUrl(url: string): Promise<TagHierarchy | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: TagHierarchy = await res.json()
    _hierarchy = data.hierarchy ?? {}
    _loaded = true
    return data
  } catch {
    return null
  }
}

export function isLoaded(): boolean {
  return _loaded
}

export function getDescendants(tag: string, visited = new Set<string>()): Set<string> {
  const result = new Set([tag])
  if (visited.has(tag)) return result
  visited.add(tag)
  const children = _hierarchy[tag]
  if (children) {
    for (const child of children) {
      for (const d of getDescendants(child, visited)) {
        result.add(d)
      }
    }
  }
  return result
}

export function expandFilters(activeFilters: Set<string>): Set<string> {
  const expanded = new Set<string>()
  for (const f of activeFilters) {
    for (const d of getDescendants(f)) {
      expanded.add(d)
    }
  }
  return expanded
}

export function getTagColor(tag: string): string {
  const lower = tag.toLowerCase()
  return TAG_COLORS[lower] ?? "--fg-muted"
}

export function collectTags(restaurants: Restaurant[]): string[] {
  const tags = new Set<string>()
  for (const r of restaurants) {
    for (const day of Object.values(r.days)) {
      if (!day?.categories) continue
      for (const cat of day.categories) {
        for (const item of cat.items) {
          for (const tag of item.tags || []) tags.add(tag)
        }
      }
    }
  }
  if (_loaded) {
    for (const parent of Object.keys(_hierarchy)) tags.add(parent)
  }
  const presetOrder = new Map(Object.keys(TAG_COLORS).map((k, i) => [k, i]))
  return [...tags].sort((a, b) => {
    const ai = presetOrder.get(a.toLowerCase()) ?? -1
    const bi = presetOrder.get(b.toLowerCase()) ?? -1
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}
