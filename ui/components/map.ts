import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { config } from "../config"
import { BADGES } from "../constants"
import { escapeHtml, smoothScrollTo } from "../utils/dom"
import { t } from '../i18n/i18n'
import { syncHeight } from "./carousel"
import type { Restaurant } from "../types"

/* ── Module-level state ───────────────────────────────── */

let _leafletMap: L.Map | null = null
let _inlineMap: L.Map | null = null
let _inlineMarkers: Record<string, L.Marker> = {}
let _restaurants: Restaurant[] = []
let _getActivePanel: () => HTMLElement | null = () => null

/* ── Internal helpers ─────────────────────────────────── */

function buildMapPopup(r: Restaurant): string {
  let html = `<strong>${escapeHtml(r.title)}</strong>`
  if (r.cuisine?.length) {
    html += `<br><span style="font-size:var(--text-xs);color:var(--text-secondary)">${r.cuisine.map(c => escapeHtml(c)).join(' \u00b7 ')}</span>`
  }
  if (r.availableDays) {
    html += `<br><span style="font-size:var(--text-xxs);font-weight:600;color:var(--mauve)">${t('map.onlyDays', { days: r.availableDays.map(d => t('dayShort.' + d)).join(', ') })}</span>`
  }
  const badges = BADGES.filter(b => r[b.prop]).map(b => `<span style="color:var(--${b.color})">${t(b.i18n)}</span>`)
  if (badges.length) {
    html += `<br><span style="font-size:var(--text-xxs);font-weight:600">${badges.join(' \u00b7 ')}</span>`
  }
  return html
}

function addMapMarkers(
  map: L.Map,
  restaurants: Restaurant[],
  opts: { onClick?: (id: string) => void; store?: Record<string, L.Marker> } = {}
): void {
  const { onClick, store } = opts
  for (const r of restaurants) {
    if (!r.coordinates) continue
    const emoji = r.title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u)?.[0] ?? '\u{1F4CD}'
    const icon = L.divIcon({
      className: 'map-marker',
      html: `<span class="map-marker-emoji">${emoji}</span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20],
    })
    const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon }).addTo(map)
    marker.bindPopup(buildMapPopup(r), { closeButton: false, className: 'map-popup' })
    if (onClick) marker.on('click', () => onClick(r.id))
    marker.on('mouseover', function (this: L.Marker) { this.openPopup() })
    marker.on('mouseout', function (this: L.Marker) { this.closePopup() })
    if (store) store[r.id] = marker
  }
}

/* ── Public API ───────────────────────────────────────── */

export function moveInlineMap(targetDay: string | null, getActivePanel: () => HTMLElement | null): void {
  _getActivePanel = getActivePanel
  const panel = targetDay
    ? document.querySelector<HTMLElement>(`.day-panel[data-panel="${targetDay}"]`)
    : getActivePanel()
  if (!panel) return
  const newMapCard = panel.querySelector<HTMLElement>('.map-card')
  if (!newMapCard) return
  const oldMapCard = document.getElementById('map-card')
  if (oldMapCard) oldMapCard.removeAttribute('id')
  newMapCard.id = 'map-card'
  const newSlot = newMapCard.querySelector<HTMLElement>('.map-slot')
  if (!newSlot) return
  let mapDiv = document.getElementById('inline-map')
  if (mapDiv) {
    if (mapDiv.parentElement !== newSlot) {
      newSlot.appendChild(mapDiv)
      if (_inlineMap) setTimeout(() => _inlineMap!.invalidateSize(), 50)
    }
  } else {
    mapDiv = document.createElement('div')
    mapDiv.id = 'inline-map'
    newSlot.appendChild(mapDiv)
  }
}

export function initInlineMap(restaurants: Restaurant[]): void {
  _restaurants = restaurants
  if (_inlineMap) { _inlineMap.invalidateSize(); return }
  const container = document.getElementById('inline-map')
  if (!container) return

  _inlineMap = L.map('inline-map', { zoomControl: false, attributionControl: false })
    .setView([config.map.center.lat, config.map.center.lon], config.map.zoom)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_inlineMap)
  addMapMarkers(_inlineMap, restaurants, {
    onClick: (id) => scrollToRestaurant(id, _getActivePanel),
    store: _inlineMarkers,
  })
}

export function syncInlineMap(): void {
  const card = document.getElementById('map-card')
  if (card && !card.classList.contains('map-collapsed')) {
    if (_inlineMap) _inlineMap.invalidateSize()
  }
}

function scrollToRestaurant(id: string, getActivePanel: () => HTMLElement | null): void {
  const activePanel = getActivePanel()
  if (!activePanel) return
  const card = activePanel.querySelector<HTMLElement>(`.restaurant-card[data-restaurant="${id}"]`)
  if (!card) return

  if (card.classList.contains('collapsed')) {
    card.classList.remove('collapsed')
  }

  smoothScrollTo(card)
  card.classList.add('map-highlight')
  setTimeout(() => card.classList.remove('map-highlight'), 1500)
}

export function focusOnMap(restaurantId: string, restaurants: Restaurant[]): void {
  const r = restaurants.find(r => r.id === restaurantId)
  if (!r?.coordinates) return

  const mapCard = document.getElementById('map-card')
  if (!mapCard) return

  if (mapCard.classList.contains('map-collapsed')) {
    toggleMapCard()
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })

  const fly = () => {
    if (!_inlineMap) return
    _inlineMap.flyTo([r.coordinates!.lat, r.coordinates!.lon], 17, { duration: 0.8 })
    if (_inlineMarkers[restaurantId]) _inlineMarkers[restaurantId].openPopup()
  }

  setTimeout(fly, _inlineMap ? 300 : 500)
}

export function toggleMapCard(): void {
  const primary = document.getElementById('map-card')
  if (!primary) return
  const isCollapsed = primary.classList.toggle('map-collapsed')
  localStorage.setItem('map-collapsed', String(isCollapsed))
  document.querySelectorAll<HTMLElement>('.map-card').forEach(c => {
    if (c !== primary) c.classList.toggle('map-collapsed', isCollapsed)
  })
  if (!isCollapsed) {
    if (!_inlineMap) {
      setTimeout(() => initInlineMap(_restaurants), 50)
    } else {
      setTimeout(() => _inlineMap!.invalidateSize(), 300)
    }
  }
  syncHeight()
}

export function openMap(restaurants: Restaurant[]): void {
  const overlay = document.getElementById('map-overlay')
  if (!overlay) return
  overlay.hidden = false
  document.body.style.overflow = 'hidden'
  const mapCard = document.getElementById('map-card')
  if (mapCard) mapCard.style.visibility = 'hidden'

  if (!_leafletMap) {
    _leafletMap = L.map('map-container', { zoomControl: false })
      .setView([config.map.center.lat, config.map.center.lon], config.map.zoom + 1)

    L.control.zoom({ position: 'bottomright' }).addTo(_leafletMap)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_leafletMap)

    addMapMarkers(_leafletMap, restaurants)
  }

  setTimeout(() => {
    _leafletMap!.invalidateSize()
  }, 100)
}

export function closeMap(): void {
  const overlay = document.getElementById('map-overlay')
  if (overlay) overlay.hidden = true
  document.body.style.overflow = ''
  const mapCard = document.getElementById('map-card')
  if (mapCard) mapCard.style.visibility = ''
}

export function setupMapListeners(restaurants: Restaurant[]): void {
  // Delegate map card clicks (works across day switches)
  document.getElementById('content')?.addEventListener('click', e => {
    const target = e.target as HTMLElement
    const mapCard = target.closest('.map-card')
    if (!mapCard) return
    if (target.closest('.map-fullscreen-btn')) {
      openMap(restaurants)
      return
    }
    if (target.closest('.collapse-btn')) {
      toggleMapCard()
    }
  })

  // Fullscreen overlay close
  document.getElementById('map-close')?.addEventListener('click', closeMap)
  document.getElementById('map-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeMap()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('map-overlay')?.hidden) {
      closeMap()
    }
  })
}

export function rebuildInlineMap(restaurants: Restaurant[]): void {
  if (_inlineMap) {
    _inlineMap.remove()
    _inlineMap = null
    _inlineMarkers = {}
  }
  const container = document.getElementById('inline-map')
  if (container) container.innerHTML = ''
  initInlineMap(restaurants)
}
