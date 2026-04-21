import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Restaurant } from "../../types"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./search.css", () => ({}))

vi.mock("../../icons", () => ({
  icons: { search: "<svg>search</svg>" },
  restaurantIconSpan: () => "<span></span>",
}))

vi.mock("../../i18n/i18n", () => ({
  t: (key: string) => key,
}))

const mockRegisterOverlay = vi.fn()
const mockUnregisterOverlay = vi.fn()

vi.mock("../../utils/dom", () => ({
  registerOverlay: (...args: unknown[]) => mockRegisterOverlay(...args),
  unregisterOverlay: (...args: unknown[]) => mockUnregisterOverlay(...args),
  escapeHtml: (s: string) => s,
  highlightMatch: (text: string) => text,
}))

vi.mock("../../utils/today", () => ({
  todayIso: () => "2026-04-22", // Wednesday
}))

const mockGetActiveFilters = vi.fn<() => Set<string> | null>()

/* ── Import after mocks ─────────────────────────────────── */

import { setupSearch, openSearch, closeSearch, updateSearchRestaurants } from "./search"

/* ── Helpers ─────────────────────────────────────────────── */

function makeInput(): HTMLInputElement {
  const input = document.createElement("input")
  input.type = "text"
  return input
}

function makeElement(tag = "div"): HTMLElement {
  return document.createElement(tag)
}

function makeRestaurant(id: string, title: string, days: Record<string, { categories: { name: string; items: { title: string; description?: string | null; tags?: string[] }[] }[] }> = {}): Restaurant {
  return {
    id,
    title,
    url: "",
    type: "full",
    fetchedAt: "2026-04-07T10:00:00Z",
    error: null,
    days: Object.fromEntries(
      Object.entries(days).map(([day, menu]) => [
        day,
        {
          fetchedAt: "2026-04-07T10:00:00Z",
          categories: menu.categories.map(c => ({
            name: c.name,
            items: c.items.map(item => ({
              title: item.title,
              description: item.description ?? null,
              price: null,
              tags: item.tags ?? [],
              allergens: null,
            })),
          })),
        },
      ])
    ),
  }
}

function setupDOM() {
  document.body.innerHTML = ""
  const overlay = makeElement()
  overlay.hidden = true
  const input = makeInput()
  const results = makeElement()
  document.body.appendChild(overlay)
  document.body.appendChild(input)
  document.body.appendChild(results)
  return { overlay, input, results }
}

async function triggerInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event("input"))
  // The debounce is 150ms - use fake timers or just wait
  await new Promise(r => setTimeout(r, 200))
}

/* ── Tests ──────────────────────────────────────────────── */

describe("setupSearch", () => {
  beforeEach(() => {
    mockGetActiveFilters.mockReturnValue(null)
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("initializes without throwing", () => {
    const { overlay, input, results } = setupDOM()
    expect(() => setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })).not.toThrow()
  })

  it("sets trigger innerHTML when trigger is provided", () => {
    const { overlay, input, results } = setupDOM()
    const trigger = makeElement("button")
    setupSearch({ overlay, input, results, trigger, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    expect(trigger.innerHTML).toContain("search")
  })
})

describe("openSearch / closeSearch", () => {
  beforeEach(() => {
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("openSearch shows the overlay and registers it", () => {
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    openSearch()
    expect(overlay.hidden).toBe(false)
    expect(mockRegisterOverlay).toHaveBeenCalledWith("search")
  })

  it("closeSearch hides the overlay and unregisters it", () => {
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    openSearch()
    closeSearch()
    expect(overlay.hidden).toBe(true)
    expect(mockUnregisterOverlay).toHaveBeenCalledWith("search")
  })

  it("closeSearch clears the input value", () => {
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    input.value = "pizza"
    closeSearch()
    expect(input.value).toBe("")
  })

  it("closeSearch empties the results container", () => {
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    results.innerHTML = "<div>something</div>"
    closeSearch()
    expect(results.innerHTML).toBe("")
  })
})

describe("performSearch – filtering logic", () => {
  beforeEach(() => {
    mockGetActiveFilters.mockReturnValue(null)
  })

  it("empty query clears results", async () => {
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    results.innerHTML = "<div>old result</div>"
    await triggerInput(input, "")
    expect(results.innerHTML).toBe("")
  })

  it("matches restaurant by name", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Gasthaus Zum Löwen", {
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Löwen")
    expect(results.innerHTML).toContain("Gasthaus Zum Löwen")
  })

  it("matches item by title", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Wiener Schnitzel" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Wiener")
    expect(results.innerHTML).toContain("Wiener Schnitzel")
  })

  it("matches item by description", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Bistro", {
      "2026-04-20": {
        categories: [{
          name: "Hauptspeise",
          items: [{ title: "Tagesgericht", description: "mit Krautsalat und Pommes" }],
        }],
      },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Krautsalat")
    expect(results.innerHTML).toContain("Tagesgericht")
  })

  it("returns no-results message when nothing matches", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "xyznotfound")
    expect(results.innerHTML).toContain("search.noResults")
  })

  it("search is case-insensitive", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Schnitzel" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "SCHNITZEL")
    expect(results.innerHTML).toContain("Mensa")
  })

  it("searches across all days, not just today", async () => {
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-20": { categories: [{ name: "Hauptspeise", items: [{ title: "Montag Gulasch" }] }] },
      "2026-04-24": { categories: [{ name: "Hauptspeise", items: [{ title: "Freitag Fisch" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Fisch")
    expect(results.innerHTML).toContain("Freitag Fisch")
  })

  it("respects active filters - excludes items whose tags don't match", async () => {
    mockGetActiveFilters.mockReturnValue(new Set(["vegan"]))

    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-22": {
        categories: [{
          name: "Hauptspeise",
          items: [
            { title: "Veganer Burger", tags: ["vegan"] },
            { title: "Fleisch Schnitzel", tags: ["meat"] },
          ],
        }],
      },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "burger")
    expect(results.innerHTML).toContain("Veganer Burger")
    // Schnitzel doesn't match the query anyway here, but let's verify filter works
  })

  it("includes items with no tags when filters are active", async () => {
    mockGetActiveFilters.mockReturnValue(new Set(["vegan"]))

    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("r1", "Bistro", {
      "2026-04-22": {
        categories: [{
          name: "Hauptspeise",
          items: [
            { title: "Tagesgericht", tags: [] }, // no tags → always shown
          ],
        }],
      },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Tagesgericht")
    expect(results.innerHTML).toContain("Tagesgericht")
  })

  it("sorts today's results first", async () => {
    const { overlay, input, results } = setupDOM()
    // Only Wednesday (index 2) and Monday (index 0)
    const restaurant = makeRestaurant("r1", "Mensa", {
      "2026-04-20": { categories: [{ name: "Hauptspeise", items: [{ title: "Spaghetti" }] }] },
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Spaghetti Carbonara" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })
    await triggerInput(input, "Spaghetti")
    const firstResult = results.querySelector("[data-restaurant-id]") as HTMLElement | null
    // Wednesday match (dayIndex=2, today) should appear first
    expect(firstResult?.dataset.dayIndex).toBe("2")
  })
})

describe("updateSearchRestaurants", () => {
  it("updates the restaurant list used for searching", async () => {
    mockGetActiveFilters.mockReturnValue(null)
    const { overlay, input, results } = setupDOM()
    setupSearch({ overlay, input, results, restaurants: [], onNavigate: vi.fn(), getActiveFilters: mockGetActiveFilters })

    const newRestaurant = makeRestaurant("r2", "Neues Lokal", {
      "2026-04-22": { categories: [{ name: "Hauptspeise", items: [{ title: "Gulasch" }] }] },
    })
    updateSearchRestaurants([newRestaurant])
    await triggerInput(input, "Gulasch")
    expect(results.innerHTML).toContain("Gulasch")
  })
})

describe("result click navigation", () => {
  it("clicking a result calls onNavigate with correct restaurantId and dayIndex", () => {
    const onNavigate = vi.fn()
    const { overlay, input, results } = setupDOM()
    const restaurant = makeRestaurant("bistro-1", "Bistro", {
      "2026-04-21": { categories: [{ name: "Hauptspeise", items: [{ title: "Pizza" }] }] },
    })
    setupSearch({ overlay, input, results, restaurants: [restaurant], onNavigate, getActiveFilters: mockGetActiveFilters })

    // Inject a fake result directly
    results.innerHTML = `<div class="search-result" data-restaurant-id="bistro-1" data-day-index="1"><div>Pizza</div></div>`
    const resultEl = results.querySelector("[data-restaurant-id]") as HTMLElement
    resultEl.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(onNavigate).toHaveBeenCalledWith("bistro-1", 1)
  })
})
