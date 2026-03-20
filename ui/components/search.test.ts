import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openSearch, closeSearch, setupSearchListeners } from './search'
import type { Restaurant } from '../types'

const DOM_HTML = `
  <button id="search-trigger"></button>
  <div id="search-overlay" hidden>
    <div class="search-modal">
      <input id="search-input" />
      <div id="search-results"></div>
    </div>
  </div>
`

const makeRestaurant = (overrides: Partial<Restaurant> & { id: string; title: string }): Restaurant => ({
  url: 'https://example.com',
  type: 'full',
  fetchedAt: '2026-03-20T10:00:00Z',
  error: null,
  days: {},
  ...overrides,
})

const makeDeps = (restaurants: Restaurant[], day = 'monday') => ({
  getActiveDay: () => day,
  getMenuRestaurants: () => restaurants,
  isFilterShowAll: () => true,
  itemMatchesFilters: (_item: { tags?: string[] }) => true,
})

const triggerInput = (value: string) => {
  const input = document.getElementById('search-input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('openSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_HTML
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the overlay, clears input value, and focuses input', () => {
    const overlay = document.getElementById('search-overlay')!
    const input = document.getElementById('search-input') as HTMLInputElement
    input.value = 'previous query'
    expect(overlay.hidden).toBe(true)

    const focusSpy = vi.spyOn(input, 'focus')
    openSearch()

    expect(overlay.hidden).toBe(false)
    expect(input.value).toBe('')
    expect(focusSpy).toHaveBeenCalledOnce()
  })

  it('clears any existing search results when opened', () => {
    const results = document.getElementById('search-results')!
    results.innerHTML = '<div>old result</div>'

    openSearch()

    expect(results.innerHTML).toBe('')
  })

  it('does nothing gracefully when elements are missing', () => {
    document.body.innerHTML = ''
    // Should not throw
    expect(() => openSearch()).not.toThrow()
  })
})

describe('closeSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_HTML
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides the overlay', () => {
    const overlay = document.getElementById('search-overlay')!
    overlay.hidden = false

    closeSearch()

    expect(overlay.hidden).toBe(true)
  })
})

describe('performSearch (via setupSearchListeners)', () => {
  beforeEach(() => {
    document.body.innerHTML = DOM_HTML
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const buildRestaurant = (id: string, title: string, items: { title: string; description?: string | null; price?: string | null; tags?: string[] }[]) =>
    makeRestaurant({
      id,
      title,
      days: {
        monday: {
          categories: [
            {
              name: 'Main',
              items: items.map(i => ({
                title: i.title,
                description: i.description ?? null,
                price: i.price ?? null,
                tags: i.tags ?? [],
                allergens: null,
              })),
            },
          ],
        },
      },
    })

  it('finds items matching query in title', () => {
    const restaurant = buildRestaurant('r1', 'Testaurant', [
      { title: 'Schnitzel mit Pommes' },
      { title: 'Salat' },
    ])
    setupSearchListeners(makeDeps([restaurant]))

    triggerInput('schnitzel')
    vi.advanceTimersByTime(150)

    const results = document.getElementById('search-results')!
    expect(results.innerHTML).toContain('Schnitzel')
    expect(results.innerHTML).not.toContain('Salat')
  })

  it('finds items matching restaurant name and shows top 3 items', () => {
    const restaurant = buildRestaurant('r1', 'Pizzeria Roma', [
      { title: 'Margherita' },
      { title: 'Funghi' },
      { title: 'Salami' },
      { title: 'Tonno' },
    ])
    setupSearchListeners(makeDeps([restaurant]))

    triggerInput('pizzeria')
    vi.advanceTimersByTime(150)

    const results = document.getElementById('search-results')!
    // Restaurant name match shows up to 3 items per category
    expect(results.innerHTML).toContain('Pizzeria Roma')
    // Should show items (first 3 from the category)
    expect(results.innerHTML).toContain('Margherita')
    expect(results.innerHTML).toContain('Funghi')
    expect(results.innerHTML).toContain('Salami')
    expect(results.innerHTML).not.toContain('Tonno')
  })

  it('shows "Keine Ergebnisse" when no matches', () => {
    const restaurant = buildRestaurant('r1', 'Testaurant', [
      { title: 'Schnitzel' },
    ])
    setupSearchListeners(makeDeps([restaurant]))

    triggerInput('sushi')
    vi.advanceTimersByTime(150)

    const results = document.getElementById('search-results')!
    expect(results.innerHTML).toContain('Keine Ergebnisse')
  })

  it('respects day filtering — skips restaurants not available on the active day', () => {
    const restaurant = buildRestaurant('r1', 'Weekday Only', [
      { title: 'Tagesmenü' },
    ])
    restaurant.availableDays = ['Dienstag', 'Mittwoch'] as any

    // Active day is Montag, but restaurant only available Dienstag/Mittwoch
    setupSearchListeners(makeDeps([restaurant], 'Montag'))

    triggerInput('tagesmenü')
    vi.advanceTimersByTime(150)

    const results = document.getElementById('search-results')!
    expect(results.innerHTML).toContain('Keine Ergebnisse')
  })

  it('clears results when query is empty', () => {
    const restaurant = buildRestaurant('r1', 'Testaurant', [
      { title: 'Schnitzel' },
    ])
    setupSearchListeners(makeDeps([restaurant]))

    // First search to populate results
    triggerInput('schnitzel')
    vi.advanceTimersByTime(150)
    expect(document.getElementById('search-results')!.innerHTML).not.toBe('')

    // Now clear the input
    triggerInput('')
    vi.advanceTimersByTime(150)
    expect(document.getElementById('search-results')!.innerHTML).toBe('')
  })
})
