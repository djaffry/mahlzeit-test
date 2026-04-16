import type { Restaurant } from "../../types"

const STORAGE_KEY = "peckish:favorites"

const _state = {
  favorites: new Set<string>(),
}

export function loadFavorites(): void {
  _state.favorites.clear()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const ids = JSON.parse(stored) as string[]
      ids.forEach((id) => _state.favorites.add(id))
    }
  } catch {
    // corrupted data — start fresh
  }
}

function saveFavorites(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([..._state.favorites]))
}

export function isFavorite(restaurantId: string): boolean {
  return _state.favorites.has(restaurantId)
}

export function toggleFavorite(restaurantId: string): void {
  if (_state.favorites.has(restaurantId)) {
    _state.favorites.delete(restaurantId)
  } else {
    _state.favorites.add(restaurantId)
  }
  saveFavorites()
}

export function getFavoriteIds(): Set<string> {
  return new Set(_state.favorites)
}

export function hasFavorites(): boolean {
  return _state.favorites.size > 0
}

export function sortWithFavorites(restaurants: Restaurant[]): Restaurant[] {
  if (_state.favorites.size === 0) return restaurants
  const pinned: Restaurant[] = []
  const unpinned: Restaurant[] = []
  for (const r of restaurants) {
    if (_state.favorites.has(r.id)) pinned.push(r)
    else unpinned.push(r)
  }
  return [...pinned, ...unpinned]
}
