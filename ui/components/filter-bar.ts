import { getTagColor, expandFilters, getDescendants, isLoaded } from "../utils/tag-utils"
import { haptic } from "../utils/haptic"
import { t } from '../i18n/i18n'

let activeFilters = new Set<string>()
let _filterCount = 0
let _allTags: string[] = []
let _effectiveCache: Set<string> | null = null
let _effectiveLowerCache: Set<string> | null = null

export function loadFilters(availableTags: string[]): void {
  invalidateEffectiveCache()
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
  invalidateEffectiveCache()
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

function invalidateEffectiveCache(): void { _effectiveCache = null; _effectiveLowerCache = null }

function getEffectiveFilters(): Set<string> {
  if (_effectiveCache) return _effectiveCache
  _effectiveCache = isLoaded() ? expandFilters(activeFilters) : new Set(activeFilters)
  return _effectiveCache
}

function getEffectiveFiltersLower(): Set<string> {
  if (_effectiveLowerCache) return _effectiveLowerCache
  _effectiveLowerCache = new Set([...getEffectiveFilters()].map(f => f.toLowerCase()))
  return _effectiveLowerCache
}

export function itemMatchesFilters(item: { tags?: string[] }): boolean {
  const tags = item.tags ?? []
  if (tags.length === 0) return true
  return tags.some(tag => getEffectiveFilters().has(tag))
}

function updateFiltersLabel(): void {
  const label = document.querySelector('.filters-label')
  if (!label) return
  const allActive = activeFilters.size === _filterCount
  label.innerHTML = allActive
    ? `${t('filter.label')} <span class="filters-clear">\u25cf</span>`
    : `${t('filter.label')} <span class="filters-clear">\u25cb</span>`
}

export function buildFilterButtons(allTags: string[]): void {
  const filtersEl = document.getElementById('filters')
  if (!filtersEl) return
  filtersEl.innerHTML = `<span class="filters-label">${t('filter.label')}</span>`
  _allTags = allTags
  invalidateEffectiveCache()
  _filterCount = allTags.length

  for (const tag of allTags) {
    const color = getTagColor(tag)
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.dataset.filter = tag
    btn.textContent = t('tag.' + tag)
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
  const effective = showAll ? null : getEffectiveFiltersLower()

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
      const matches = tags === '' || tagList.some(tag => effective!.has(tag))
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
    const turning_on = !activeFilters.has(filter)
    const affected = isLoaded() ? getDescendants(filter) : new Set([filter])
    for (const tag of affected) {
      if (turning_on) activeFilters.add(tag)
      else activeFilters.delete(tag)
    }
    invalidateEffectiveCache()
    for (const tag of affected) {
      const b = filtersEl.querySelector<HTMLElement>(`.filter-btn[data-filter="${tag}"]`)
      if (b) b.classList.toggle('active', turning_on)
    }
    updateFiltersLabel()
    saveFilters()
    onFilterChange()
  })
}
