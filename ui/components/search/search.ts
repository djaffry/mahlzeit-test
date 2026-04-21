import "./search.css"
import type { Restaurant } from "../../types"
import { icons, restaurantIconSpan } from "../../icons"
import { t } from "../../i18n/i18n"
import { escapeHtml, highlightMatch, registerOverlay, unregisterOverlay } from "../../utils/dom"
import { todayIso } from "../../utils/today"
import { isoToWeekdayIndex } from "../../utils/date"
import { itemMatchesFilters } from "../filter-bar/filter-bar"

const DEBOUNCE_MS = 150
const MAX_PREVIEW_ITEMS = 3
const MAX_MATCHED_ITEMS = 5
const MAX_SEARCH_RESULTS = 20

let _state: {
  overlay: HTMLElement
  input: HTMLInputElement
  results: HTMLElement
  restaurants: Restaurant[]
  onNavigate: (restaurantId: string, dayIndex: number) => void
  getActiveFilters: () => Set<string> | null
  ac: AbortController
} | null = null

export interface SearchOptions {
  overlay: HTMLElement
  input: HTMLInputElement
  results: HTMLElement
  trigger?: HTMLElement
  restaurants: Restaurant[]
  onNavigate: (restaurantId: string, dayIndex: number) => void
  getActiveFilters: () => Set<string> | null
}

export function setupSearch(opts: SearchOptions): void {
  _state?.ac.abort()

  _state = {
    overlay: opts.overlay,
    input: opts.input,
    results: opts.results,
    restaurants: opts.restaurants,
    onNavigate: opts.onNavigate,
    getActiveFilters: opts.getActiveFilters,
    ac: new AbortController(),
  }

  const { signal } = _state.ac

  if (opts.trigger) {
    opts.trigger.innerHTML = icons.search
    opts.trigger.addEventListener("click", openSearch, { signal })
  }

  let timer: ReturnType<typeof setTimeout>
  opts.input.addEventListener("input", () => {
    clearTimeout(timer)
    timer = setTimeout(() => performSearch(opts.input.value.trim()), DEBOUNCE_MS)
  }, { signal })

  opts.results.addEventListener("click", (e: Event) => {
    const result = (e.target as HTMLElement).closest("[data-restaurant-id]") as HTMLElement | null
    if (result && _state) {
      const rid = result.dataset.restaurantId!
      const dayIdx = Number(result.dataset.dayIndex ?? 0)
      closeSearch()
      _state.onNavigate(rid, dayIdx)
    }
  }, { signal })

  opts.overlay.addEventListener("click", (e: Event) => {
    if (e.target === opts.overlay) closeSearch()
  }, { signal })
}

export function openSearch(): void {
  if (!_state) return
  _state.overlay.hidden = false
  registerOverlay("search")
  requestAnimationFrame(() => {
    _state?.overlay.classList.add("visible")
    _state?.input.focus()
  })
}

export function closeSearch(): void {
  if (!_state) return
  unregisterOverlay("search")
  _state.overlay.classList.remove("visible")
  _state.overlay.hidden = true
  _state.input.value = ""
  _state.results.innerHTML = ""
}

interface Match {
  restaurant: Restaurant
  dayIndex: number
  isToday: boolean
  items: string[]
}

function collectMatches(restaurants: Restaurant[], query: string, filters: Set<string> | null, today: string): Match[] {
  const q = query.toLowerCase()
  const matches: Match[] = []

  for (const r of restaurants) {
    const nameMatch = r.title.toLowerCase().includes(q)

    if (r.type === "link") {
      const dayIndex = isoToWeekdayIndex(today)
      if (dayIndex < 0) continue // weekends: link restaurants have no day to expand into
      if (nameMatch) matches.push({ restaurant: r, dayIndex, isToday: true, items: [r.title] })
      continue
    }

    for (const isoDate of Object.keys(r.days ?? {}).sort()) {
      const menu = r.days[isoDate]
      if (!menu) continue

      const di = isoToWeekdayIndex(isoDate)
      if (di < 0) continue // guard weekend keys (scraper only writes Mon–Fri, but be defensive)
      const isToday = isoDate === today

      const dayItems: string[] = []
      for (const cat of menu.categories) {
        for (const item of cat.items) {
          if (filters && !itemMatchesFilters(item, filters)) continue
          if (item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)) {
            dayItems.push(item.title)
          }
        }
      }

      if (nameMatch && dayItems.length === 0) {
        const preview = menu.categories.flatMap((c) => c.items).slice(0, MAX_PREVIEW_ITEMS).map((i) => i.title)
        if (preview.length > 0) matches.push({ restaurant: r, dayIndex: di, isToday, items: preview })
      } else if (dayItems.length > 0) {
        matches.push({ restaurant: r, dayIndex: di, isToday, items: dayItems.slice(0, MAX_MATCHED_ITEMS) })
      }
    }
  }

  return matches
}

function sortMatches(matches: Match[]): Match[] {
  return matches.sort((a, b) => {
    if (a.isToday && !b.isToday) return -1
    if (b.isToday && !a.isToday) return 1
    return b.items.length - a.items.length
  })
}

function renderMatches(matches: Match[], query: string): string {
  const q = query.toLowerCase()
  return matches.slice(0, MAX_SEARCH_RESULTS).map((m) => {
    const items = m.items.map((item) => {
      return `<div class="search-result-item">${highlightMatch(item, q)}</div>`
    }).join("")

    const icon = restaurantIconSpan(m.restaurant.icon, "search-result-icon")
    return `
      <div class="search-result" data-restaurant-id="${escapeHtml(m.restaurant.id)}" data-day-index="${m.dayIndex}">
        <div class="search-result-restaurant">${icon}${highlightMatch(m.restaurant.title, q)}</div>
        ${items}
      </div>`
  }).join("")
}

function performSearch(query: string): void {
  if (!_state || !query) {
    if (_state) _state.results.innerHTML = ""
    return
  }

  const filters = _state.getActiveFilters()
  const today = todayIso()
  const matches = collectMatches(_state.restaurants, query, filters, today)
  sortMatches(matches)

  _state.results.innerHTML = renderMatches(matches, query)
    || `<div class="search-result"><div class="search-result-item">${escapeHtml(t("search.noResults") ?? "No results")}</div></div>`
}

export function updateSearchRestaurants(restaurants: Restaurant[]): void {
  if (_state) _state.restaurants = restaurants
}
