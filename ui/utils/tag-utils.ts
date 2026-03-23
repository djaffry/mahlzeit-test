import { TAG_COLORS, PALETTE } from "../constants"
import type { TagHierarchy, Restaurant } from "../types"
import { escapeHtml } from "./dom"
import { t } from '../i18n/i18n'

let _hierarchy: Record<string, string[]> = {}
let _loaded = false

const _fallbackPool = PALETTE.filter((c) => !new Set(Object.values(TAG_COLORS)).has(c))
const _tagColorCache: Record<string, string> = {}

export function loadHierarchy(hierarchy: Record<string, string[]>): void {
  _hierarchy = hierarchy
  _loaded = true
}

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

export function getParentTags(): string[] {
  return Object.keys(_hierarchy)
}

export function getTagColor(tag: string): string {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag]
  if (_tagColorCache[tag]) return _tagColorCache[tag]
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0
  }
  const pool = _fallbackPool.length > 0 ? _fallbackPool : [...PALETTE]
  return (_tagColorCache[tag] = pool[Math.abs(hash) % pool.length])
}

export function tagStyle(tag: string): string {
  const c = getTagColor(tag)
  return `background:var(--${c}-dim);color:var(--${c})`
}

export function renderTags(tags: string[]): string {
  return tags
    .map((tag) => `<span class="tag" style="${tagStyle(tag)}">${escapeHtml(t('tag.' + tag))}</span>`)
    .join("")
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
    for (const parent of getParentTags()) tags.add(parent)
  }
  const presetOrder = new Map(Object.keys(TAG_COLORS).map((k, i) => [k, i]))
  return [...tags].sort((a, b) => {
    const ai = presetOrder.get(a) ?? -1
    const bi = presetOrder.get(b) ?? -1
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}
