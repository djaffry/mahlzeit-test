import { escapeHtml, highlightMatch } from "../utils/dom"
import { renderTags } from "../utils/tag-utils"
import { isAvailableOnDay } from "../utils/date"
import type { Restaurant } from "../types"

export function openSearch(): void {
  const overlay = document.getElementById('search-overlay')
  const input = document.getElementById('search-input') as HTMLInputElement | null
  if (!overlay || !input) return
  overlay.hidden = false
  input.value = ''
  const results = document.getElementById('search-results')
  if (results) results.innerHTML = ''
  input.focus()
}

export function closeSearch(): void {
  const overlay = document.getElementById('search-overlay')
  if (overlay) overlay.hidden = true
}

interface SearchDeps {
  getActiveDay: () => string
  getMenuRestaurants: () => Restaurant[]
  isFilterShowAll: () => boolean
  itemMatchesFilters: (item: { tags?: string[] }) => boolean
}

function performSearch(query: string, deps: SearchDeps): void {
  const resultsEl = document.getElementById('search-results')
  if (!resultsEl) return
  if (!query.trim()) { resultsEl.innerHTML = ''; return }

  const q = query.toLowerCase().trim()
  const day = deps.getActiveDay()
  const restaurants = deps.getMenuRestaurants()
  const showAll = deps.isFilterShowAll()
  const passes = (item: { tags?: string[] }) => showAll || deps.itemMatchesFilters(item)
  const groups: { title: string; items: { item: { title: string; description: string | null; price: string | null; tags: string[]; allergens: string | null } }[] }[] = []

  for (const r of restaurants) {
    if (!isAvailableOnDay(r, day)) continue
    const dayData = r.days[day]
    if (!dayData?.categories) continue
    const matches: { item: { title: string; description: string | null; price: string | null; tags: string[]; allergens: string | null } }[] = []
    for (const cat of dayData.categories) {
      for (const item of cat.items) {
        if (!passes(item)) continue
        const haystack = [item.title, item.description, item.price, ...(item.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
        if (haystack.includes(q)) {
          matches.push({ item })
        }
      }
    }
    const titleMatch = r.title.toLowerCase().includes(q)
    if (matches.length > 0 || titleMatch) {
      const filteredItems = titleMatch && matches.length === 0
        ? dayData.categories.flatMap(c => c.items.filter(passes).slice(0, 3).map(item => ({ item })))
        : matches
      if (filteredItems.length > 0) {
        groups.push({ title: r.title, items: filteredItems })
      }
    }
  }

  if (groups.length === 0) {
    resultsEl.innerHTML = '<div class="search-no-results">Keine Ergebnisse</div>'
    return
  }

  resultsEl.innerHTML = groups.map(g => {
    const items = g.items.slice(0, 5).map(({ item }) => {
      const title = highlightMatch(escapeHtml(item.title), q)
      const price = item.price ? `<span class="item-price">${escapeHtml(item.price)}</span>` : ''
      const desc = item.description ? `<div class="item-description">${highlightMatch(escapeHtml(item.description), q)}</div>` : ''
      const tags = renderTags(item.tags || [])
      const meta = [tags, price].filter(Boolean).join(' ')
      return `<div class="search-result-item">
        <div class="search-result-title">${title}</div>
        ${desc}
        ${meta ? `<div class="search-result-meta">${meta}</div>` : ''}
      </div>`
    }).join('')
    return `<div class="search-group-title">${escapeHtml(g.title)}</div>${items}`
  }).join('')
}

export function setupSearchListeners(deps: SearchDeps): void {
  document.getElementById('search-trigger')?.addEventListener('click', openSearch)
  document.getElementById('search-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSearch()
  })
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const input = document.getElementById('search-input')
  input?.addEventListener('input', e => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => performSearch((e.target as HTMLInputElement).value, deps), 150)
  })
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch() }
    if (e.key === '/' && !(e.target as Element).closest('input, textarea, [contenteditable]')) { e.preventDefault(); openSearch() }
    if (e.key === 'Escape') closeSearch()
  })
}
