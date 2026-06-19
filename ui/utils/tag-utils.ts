import { TAG_COLORS, INFORMATIVE_TAGS } from "../constants"
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

/**
 * Walk the hierarchy upward to find an ancestor whose lowercase name
 * appears in TAG_COLORS. Returns null if no ancestor has a colour entry.
 */
function findAncestorColor(tag: string, visited = new Set<string>()): string | null {
  if (visited.has(tag)) return null
  visited.add(tag)
  for (const [parent, children] of Object.entries(_hierarchy)) {
    if (children.includes(tag)) {
      const color = TAG_COLORS[parent.toLowerCase()]
      if (color) return color
      return findAncestorColor(parent, visited)
    }
  }
  return null
}

export function getTagColor(tag: string): string {
  const lower = tag.toLowerCase()
  if (TAG_COLORS[lower]) return TAG_COLORS[lower]

  // When the hierarchy is loaded, inherit colour from the nearest ancestor.
  if (_loaded) {
    const inherited = findAncestorColor(tag)
    if (inherited) return inherited
  }

  return "--fg-muted"
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
  return [...tags]
    .filter((tag) => !INFORMATIVE_TAGS.has(tag))
    .sort((a, b) => {
    const ai = presetOrder.get(a.toLowerCase()) ?? -1
    const bi = presetOrder.get(b.toLowerCase()) ?? -1
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

/** Test-only: resets module-private state between test cases. */
export function _resetForTesting(): void {
  _hierarchy = {}
  _loaded = false
}
