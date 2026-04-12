import "./filter-bar.css"
import { getTagColor, expandFilters, getDescendants, isLoaded } from "../../utils/tag-utils"
import { haptic } from "../../utils/haptic"
import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { icons } from "../../icons"
import { openOverlay } from "../overlay/overlay"

/* ── State ──────────────────────────────────────────────── */

const _state = {
  activeFilters: new Set<string>(),
  allTags: [] as string[],
  effectiveCache: null as Set<string> | null,
  onFilterChange: null as (() => void) | null,
  selectorOpen: false,
  filterBtn: null as HTMLElement | null,
}

/* ── Persistence ────────────────────────────────────────── */

function invalidateEffectiveCache(): void {
  _state.effectiveCache = null
}

export function loadFilters(availableTags: string[]): void {
  invalidateEffectiveCache()
  _state.activeFilters.clear()
  _state.allTags = availableTags
  try {
    const stored = localStorage.getItem("dietary-filters")
    if (stored) {
      const { active, known } = JSON.parse(stored) as { active: string[]; known: string[] }
      const knownSet = new Set(known)
      const availableSet = new Set(availableTags)
      active.forEach((f) => { if (availableSet.has(f)) _state.activeFilters.add(f) })
      for (const tag of availableTags) {
        if (!knownSet.has(tag)) _state.activeFilters.add(tag)
      }
    } else {
      availableTags.forEach((f) => _state.activeFilters.add(f))
    }
  } catch {
    availableTags.forEach((f) => _state.activeFilters.add(f))
  }
}

export function saveFilters(): void {
  invalidateEffectiveCache()
  localStorage.setItem("dietary-filters", JSON.stringify({ active: [..._state.activeFilters], known: _state.allTags }))
}

/* ── Queries ────────────────────────────────────────────── */

export function isFilterShowAll(): boolean { return _state.activeFilters.size === _state.allTags.length }

export function getEffectiveFilters(): Set<string> {
  if (_state.effectiveCache) return _state.effectiveCache
  const expanded = isLoaded() ? expandFilters(_state.activeFilters) : new Set(_state.activeFilters)
  // A parent expansion should not override an explicitly deselected child
  for (const tag of _state.allTags) {
    if (!_state.activeFilters.has(tag)) expanded.delete(tag)
  }
  _state.effectiveCache = expanded
  return _state.effectiveCache
}

export function itemMatchesFilters(item: { tags?: string[] }, effective?: Set<string>): boolean {
  const tags = item.tags ?? []
  if (tags.length === 0) return true
  const filters = effective ?? getEffectiveFilters()
  return tags.some((tag) => filters.has(tag))
}

/* ── Filter Dot ─────────────────────────────────────────── */

export function updateFilterDot(): void {
  _state.filterBtn?.classList.toggle("has-filters", !isFilterShowAll())
}

export function initFilters(onFilterChange: () => void): void {
  _state.filterBtn = document.getElementById("filter-trigger")
  _state.onFilterChange = onFilterChange
  updateFilterDot()
}

/* ── Filter Selector (opened from more menu) ────────────── */

export function openFilterSelector(): void {
  if (_state.selectorOpen) return
  _state.selectorOpen = true

  function onClose(): void {
    _state.selectorOpen = false
    saveFilters()
    updateFilterDot()
    _state.onFilterChange?.()
  }

  const { panel, close } = openOverlay({
    onClose,
    onLangChange: () => { saveFilters(); renderContent() },
  })

  function renderContent(): void {
    panel.innerHTML = ""

    const header = document.createElement("div")
    header.className = "overlay-header"
    header.innerHTML = `<span class="overlay-title">${escapeHtml(t("filter.title") ?? "Filters")}</span><button class="icon-btn" id="filter-close">${icons.x}</button>`
    panel.appendChild(header)
    header.querySelector("#filter-close")?.addEventListener("click", close)

    const actions = document.createElement("div")
    actions.className = "filter-actions"
    actions.innerHTML = `<button class="filter-action-btn" data-action="select-all">${escapeHtml(t("filter.selectAll") ?? "Select all")}</button><button class="filter-action-btn" data-action="deselect-all">${escapeHtml(t("filter.deselectAll") ?? "Deselect all")}</button>`
    panel.appendChild(actions)

    const grid = document.createElement("div")
    grid.className = "filter-grid"

    function rebuildGrid(): void {
      grid.innerHTML = ""
      for (const tag of _state.allTags) {
        const btn = document.createElement("button")
        const color = getTagColor(tag)
        const isActive = _state.activeFilters.has(tag)
        btn.className = "filter-pill"
        if (isActive) btn.style.borderColor = `var(${color})`
        btn.innerHTML = `<span class="tag-pill" style="--tag-color:var(${color})">${escapeHtml(t("tag." + tag) ?? tag)}</span>`
        btn.addEventListener("click", () => {
          haptic()
          const affected = isLoaded() ? getDescendants(tag) : new Set([tag])
          if (_state.activeFilters.has(tag)) {
            for (const item of affected) _state.activeFilters.delete(item)
          } else {
            for (const item of affected) _state.activeFilters.add(item)
          }
          invalidateEffectiveCache()
          rebuildGrid()
        })
        grid.appendChild(btn)
      }
    }

    rebuildGrid()
    panel.appendChild(grid)

    actions.querySelector("[data-action='select-all']")?.addEventListener("click", () => {
      _state.allTags.forEach(tag => _state.activeFilters.add(tag))
      invalidateEffectiveCache()
      rebuildGrid()
    })
    actions.querySelector("[data-action='deselect-all']")?.addEventListener("click", () => {
      _state.activeFilters.clear()
      invalidateEffectiveCache()
      rebuildGrid()
    })
  }

  renderContent()
}
