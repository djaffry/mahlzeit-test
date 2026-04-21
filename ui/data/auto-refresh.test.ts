import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { contentHash, startAutoRefresh, initContentHash } from "./auto-refresh"
import { fetchMenuDataQuiet } from "./fetcher"
import { config } from "../config"
import type { Restaurant } from "../types"

// auto-refresh imports config and fetcher - mock the fetcher to avoid real network calls
vi.mock("./fetcher", () => ({
  fetchMenuDataQuiet: vi.fn().mockResolvedValue(null),
}))

const makeRestaurant = (overrides: Partial<Restaurant> = {}): Restaurant => ({
  id: "r1",
  title: "Restaurant One",
  url: "https://example.com",
  type: "full",
  fetchedAt: "2026-03-20T10:00:00Z",
  error: null,
  days: {
    "2026-04-20": {
      fetchedAt: "2026-04-20T08:00:00Z",
      categories: [
        {
          name: "Hauptspeise",
          items: [{ title: "Schnitzel", description: null, price: "12,90 €", tags: ["Fleisch"], allergens: "A" }],
        },
      ],
    },
  },
  ...overrides,
})

/* ── contentHash ────────────────────────────────────────── */

describe("contentHash", () => {
  it("produces consistent hash for structurally identical data", () => {
    const a = [makeRestaurant()]
    const b = [makeRestaurant()]
    expect(contentHash(a)).toBe(contentHash(b))
  })

  it("produces a different hash when content changes", () => {
    const r1 = [makeRestaurant()]
    const r2 = [makeRestaurant({ title: "Different Restaurant" })]
    expect(contentHash(r1)).not.toBe(contentHash(r2))
  })

  it("ignores fetchedAt differences - same content with different timestamps yields same hash", () => {
    const r1 = [makeRestaurant({ fetchedAt: "2026-03-20T10:00:00Z" })]
    const r2 = [makeRestaurant({ fetchedAt: "2026-03-20T11:00:00Z" })]
    expect(contentHash(r1)).toBe(contentHash(r2))
  })

  it("produces different hash when day menu items change", () => {
    const r1 = [makeRestaurant()]
    const r2 = [
      makeRestaurant({
        days: {
          "2026-04-20": {
            fetchedAt: "2026-04-20T08:00:00Z",
            categories: [
              {
                name: "Hauptspeise",
                items: [{ title: "Gulasch", description: null, price: "11,00 €", tags: [], allergens: null }],
              },
            ],
          },
        },
      }),
    ]
    expect(contentHash(r1)).not.toBe(contentHash(r2))
  })
})

/* ── startAutoRefresh ─────────────────────────────────── */

describe("startAutoRefresh", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("calls applyRefresh when fetched data has new content", async () => {
    const current = [makeRestaurant()]
    initContentHash(current)

    const updated = [makeRestaurant({ title: "Updated Restaurant" })]
    vi.mocked(fetchMenuDataQuiet).mockResolvedValueOnce(updated)

    const applyRefresh = vi.fn()
    startAutoRefresh(() => current, () => false, applyRefresh)

    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)

    expect(applyRefresh).toHaveBeenCalledWith(updated)
  })

  it("does not call applyRefresh when content hash is unchanged", async () => {
    const current = [makeRestaurant()]
    initContentHash(current)

    vi.mocked(fetchMenuDataQuiet).mockResolvedValueOnce([makeRestaurant()])

    const applyRefresh = vi.fn()
    startAutoRefresh(() => current, () => false, applyRefresh)

    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)

    expect(applyRefresh).not.toHaveBeenCalled()
  })

  it("defers refresh when isRefreshDeferred returns true", async () => {
    const current = [makeRestaurant()]
    initContentHash(current)

    const updated = [makeRestaurant({ title: "Deferred Update" })]
    vi.mocked(fetchMenuDataQuiet).mockResolvedValueOnce(updated)

    const applyRefresh = vi.fn()
    startAutoRefresh(() => current, () => true, applyRefresh)

    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)

    expect(applyRefresh).not.toHaveBeenCalled()
  })

  it("flushes deferred data on next cycle when deferral ends", async () => {
    const current = [makeRestaurant()]
    initContentHash(current)

    const updated = [makeRestaurant({ title: "Deferred Update" })]
    vi.mocked(fetchMenuDataQuiet).mockResolvedValueOnce(updated)

    const applyRefresh = vi.fn()
    let deferred = true
    startAutoRefresh(() => current, () => deferred, applyRefresh)

    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)
    expect(applyRefresh).not.toHaveBeenCalled()

    deferred = false
    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)
    expect(applyRefresh).toHaveBeenCalledWith(updated)
  })

  it("does nothing when fetch returns null", async () => {
    const current = [makeRestaurant()]
    initContentHash(current)

    vi.mocked(fetchMenuDataQuiet).mockResolvedValueOnce(null)

    const applyRefresh = vi.fn()
    startAutoRefresh(() => current, () => false, applyRefresh)

    await vi.advanceTimersByTimeAsync(config.autoRefreshInterval)

    expect(applyRefresh).not.toHaveBeenCalled()
  })
})
