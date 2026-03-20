import { getTagColor, expandFilters, isLoaded } from "../utils/tag-utils"
import { haptic } from "../utils/haptic"

let activeFilters = new Set<string>()
let _filterCount = 0
let _allTags: string[] = []

export function loadFilters(availableTags: string[]): void {
  activeFilters.clear()
  try {
    const stored = localStorage.getItem('dietary-filters')
    if (stored) {
      const { active, known } = JSON.parse(stored) as { active: string[]; known: string[] }
      const knownSet = new Set(known)
      const availableSet = new Set(availableTags)
      active.forEach(f => { if (availableSet.has(f)) activeFilters.add(f) })

      for (const tag of availableTags) {
        if (!knownSet.has(tag)) activeFilters.add(tag)
      }
    } else {
      availableTags.forEach(f => activeFilters.add(f))
    }
  } catch {
    availableTags.forEach(f => activeFilters.add(f))
  }
}

export function saveFilters(): void {
  localStorage.setItem('dietary-filters', JSON.stringify({ active: [...activeFilters], known: _allTags }))
}

export function getActiveFilters(): Set<string> {
  return activeFilters
}

export function getFilterCount(): number {
  return _filterCount
}

export function isFilterShowAll(): boolean {
  return activeFilters.size === _filterCount
}

export function itemMatchesFilters(item: { tags?: string[] }): boolean {
  const tags = item.tags ?? []
  if (tags.length === 0) return true
  const expanded = isLoaded()
    ? expandFilters(activeFilters)
    : activeFilters
  return tags.some(t => expanded.has(t))
}

function updateFiltersLabel(): void {
  const label = document.querySelector('.filters-label')
  if (!label) return
  const allActive = activeFilters.size === _filterCount
  label.innerHTML = allActive
    ? 'Filter <span class="filters-clear">\u25cf</span>'
    : 'Filter <span class="filters-clear">\u25cb</span>'
}

export function buildFilterButtons(allTags: string[]): void {
  const filtersEl = document.getElementById('filters')
  if (!filtersEl) return
  filtersEl.innerHTML = '<span class="filters-label">Filter</span>'
  _allTags = allTags
  _filterCount = allTags.length

  for (const tag of allTags) {
    const color = getTagColor(tag)
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.dataset.filter = tag
    btn.textContent = tag
    btn.style.setProperty('--filter-color', `var(--${color})`)
    btn.style.setProperty('--filter-dim', `var(--${color}-dim)`)
    if (activeFilters.has(tag)) btn.classList.add('active')
    filtersEl.appendChild(btn)
  }
  updateFiltersLabel()
}

export function applyFilters(activePanel: HTMLElement | null): void {
  if (!activePanel) return

  const showAll = isFilterShowAll()
  const expanded = !showAll && isLoaded()
    ? new Set([...expandFilters(activeFilters)].map(f => f.toLowerCase()))
    : new Set([...activeFilters].map(f => f.toLowerCase()))

  const cards = activePanel.querySelectorAll('.restaurant-card')
  cards.forEach(card => {
    const items = card.querySelectorAll<HTMLElement>('.menu-item')
    let visibleCount = 0

    items.forEach(el => {
      if (showAll) {
        el.classList.remove('hidden')
        visibleCount++
        return
      }
      const tags = (el as HTMLElement & { dataset: { tags?: string } }).dataset.tags ?? ''
      const tagList = tags ? tags.split(' ') : []
      const matches = tags === '' || tagList.some(t => expanded.has(t))
      el.classList.toggle('hidden', !matches)
      if (matches) visibleCount++
    })

    card.classList.toggle('filter-collapsed', items.length > 0 && visibleCount === 0)
  })
}

export function setupFilterListeners(filtersEl: HTMLElement, onFilterChange: () => void): void {
  filtersEl.addEventListener('click', e => {
    if (!e.target || !(e.target instanceof Element)) return
    if (!e.target.closest('.filters-label') && !e.target.closest('.filter-btn')) return
    haptic()
    if (e.target.closest('.filters-label')) {
      const allBtns = filtersEl.querySelectorAll<HTMLElement>('.filter-btn')
      const allActive = activeFilters.size === allBtns.length
      if (allActive) {
        activeFilters.clear()
        allBtns.forEach(b => b.classList.remove('active'))
      } else {
        allBtns.forEach(b => {
          const filter = b.dataset.filter
          if (filter) activeFilters.add(filter)
          b.classList.add('active')
        })
      }
      updateFiltersLabel()
      saveFilters()
      onFilterChange()
      return
    }
    const btn = e.target.closest<HTMLElement>('.filter-btn')
    if (!btn) return
    const filter = btn.dataset.filter
    if (!filter) return
    if (activeFilters.has(filter)) {
      activeFilters.delete(filter)
      btn.classList.remove('active')
    } else {
      activeFilters.add(filter)
      btn.classList.add('active')
    }
    updateFiltersLabel()
    saveFilters()
    onFilterChange()
  })
}
