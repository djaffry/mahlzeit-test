import { describe, it, expect, beforeEach } from "vitest"
import {
  loadFavorites,
  isFavorite,
  toggleFavorite,
  getFavoriteIds,
  hasFavorites,
  sortWithFavorites,
} from "./favorites"

beforeEach(() => {
  localStorage.clear()
})

describe("loadFavorites", () => {
  it("starts with no favorites when localStorage is empty", () => {
    loadFavorites()
    expect(hasFavorites()).toBe(false)
    expect(getFavoriteIds()).toEqual(new Set())
  })

  it("restores favorites from localStorage", () => {
    localStorage.setItem("peckish:favorites", JSON.stringify(["mano", "taeko"]))
    loadFavorites()
    expect(isFavorite("mano")).toBe(true)
    expect(isFavorite("taeko")).toBe(true)
    expect(isFavorite("remo")).toBe(false)
  })

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("peckish:favorites", "not valid json")
    loadFavorites()
    expect(hasFavorites()).toBe(false)
  })

  it("clears stale in-memory state on reload", () => {
    loadFavorites()
    toggleFavorite("mano")
    localStorage.setItem("peckish:favorites", JSON.stringify(["taeko"]))
    loadFavorites()
    expect(isFavorite("mano")).toBe(false)
    expect(isFavorite("taeko")).toBe(true)
  })
})

describe("toggleFavorite", () => {
  it("adds a restaurant to favorites", () => {
    loadFavorites()
    toggleFavorite("mano")
    expect(isFavorite("mano")).toBe(true)
    expect(hasFavorites()).toBe(true)
  })

  it("removes a restaurant from favorites", () => {
    localStorage.setItem("peckish:favorites", JSON.stringify(["mano"]))
    loadFavorites()
    toggleFavorite("mano")
    expect(isFavorite("mano")).toBe(false)
    expect(hasFavorites()).toBe(false)
  })

  it("persists to localStorage", () => {
    loadFavorites()
    toggleFavorite("taeko")
    const stored = JSON.parse(localStorage.getItem("peckish:favorites")!)
    expect(stored).toEqual(["taeko"])
  })
})

describe("sortWithFavorites", () => {
  it("returns original order when no favorites", () => {
    loadFavorites()
    const restaurants = [
      { id: "a" }, { id: "b" }, { id: "c" },
    ] as any[]
    const sorted = sortWithFavorites(restaurants)
    expect(sorted.map(r => r.id)).toEqual(["a", "b", "c"])
  })

  it("pins favorites to the top preserving relative order", () => {
    localStorage.setItem("peckish:favorites", JSON.stringify(["b", "c"]))
    loadFavorites()
    const restaurants = [
      { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" },
    ] as any[]
    const sorted = sortWithFavorites(restaurants)
    expect(sorted.map(r => r.id)).toEqual(["b", "c", "a", "d"])
  })

  it("does not mutate the original array", () => {
    localStorage.setItem("peckish:favorites", JSON.stringify(["b"]))
    loadFavorites()
    const restaurants = [{ id: "a" }, { id: "b" }] as any[]
    const sorted = sortWithFavorites(restaurants)
    expect(restaurants.map(r => r.id)).toEqual(["a", "b"])
    expect(sorted.map(r => r.id)).toEqual(["b", "a"])
  })
})
