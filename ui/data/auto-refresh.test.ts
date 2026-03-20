import { describe, it, expect, vi, beforeEach } from "vitest"
import { contentHash, flushPendingRefresh } from "./auto-refresh"
import type { Restaurant } from "../types"

// auto-refresh imports config and fetcher — mock the fetcher to avoid real network calls
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
    Montag: {
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
  it("produces consistent hash for the same data", () => {
    const restaurants = [makeRestaurant()]
    expect(contentHash(restaurants)).toBe(contentHash(restaurants))
  })

  it("produces a different hash when content changes", () => {
    const r1 = [makeRestaurant()]
    const r2 = [makeRestaurant({ title: "Different Restaurant" })]
    expect(contentHash(r1)).not.toBe(contentHash(r2))
  })

  it("ignores fetchedAt differences — same content with different timestamps yields same hash", () => {
    const r1 = [makeRestaurant({ fetchedAt: "2026-03-20T10:00:00Z" })]
    const r2 = [makeRestaurant({ fetchedAt: "2026-03-20T11:00:00Z" })]
    expect(contentHash(r1)).toBe(contentHash(r2))
  })

  it("produces different hash when day menu items change", () => {
    const r1 = [makeRestaurant()]
    const r2 = [
      makeRestaurant({
        days: {
          Montag: {
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

/* ── flushPendingRefresh ────────────────────────────────── */

describe("flushPendingRefresh", () => {
  it("does nothing when no pending data exists", () => {
    const callback = vi.fn()
    flushPendingRefresh(callback)
    expect(callback).not.toHaveBeenCalled()
  })
})
