import "./map-panel.css"
import type { Restaurant } from "../../types"
import { BADGES } from "../../constants"
import { icons, restaurantIconSpan } from "../../icons"
import { t } from "../../i18n/i18n"
import { config } from "../../config"
import { DESKTOP_MIN_WIDTH } from "../../constants"
import { flashAndScroll, escapeHtml, registerOverlay, unregisterOverlay, isDesktop } from "../../utils/dom"
import { formatAvailableDays } from "../../utils/date"
import type L_NS from "leaflet"

let L: typeof L_NS | null = null

async function loadLeaflet(): Promise<typeof L_NS> {
  if (L) return L
  await import("leaflet/dist/leaflet.css")
  const mod = await import("leaflet")
  L = mod.default
  return L
}

const LS_KEY_WIDTH = "peckish-map-width"
const LS_KEY_HEIGHT = "peckish-map-height"

const _state = {
  panel: null as HTMLElement | null,
  backdrop: null as HTMLElement | null,
  map: null as L_NS.Map | null,
  restaurants: [] as Restaurant[],
  visible: false,
  markers: new Map<string, L_NS.Marker>(),
}

export function setupMapPanel(restaurants: Restaurant[]): void {
  _state.restaurants = restaurants
}

export function isMapPanelOpen(): boolean {
  return _state.visible
}

export function toggleMapPanel(): void {
  if (_state.visible) closeMapPanel()
  else openMapPanel()
}

export async function openMapPanel(): Promise<void> {
  if (_state.visible) return

  if (!_state.panel) {
    await buildPanel()
  }

  _state.visible = true
  registerOverlay("map")
  _state.backdrop?.classList.add("visible")
  requestAnimationFrame(() => {
    _state.panel?.classList.add("visible")
    _state.panel?.addEventListener("transitionend", () => _state.map?.invalidateSize(), { once: true })
  })
}

export function closeMapPanel(): void {
  if (!_state.visible) return
  _state.visible = false
  unregisterOverlay("map")
  _state.panel?.classList.remove("visible")
  _state.backdrop?.classList.remove("visible")
}

export function updateMapRestaurants(restaurants: Restaurant[]): void {
  _state.restaurants = restaurants
  if (_state.panel) {
    closeMapPanel()
    _state.markers.clear()
    _state.map?.remove()
    _state.map = null
    _state.panel.remove()
    _state.panel = null
    _state.backdrop?.remove()
    _state.backdrop = null
  }
}

async function buildPanel(): Promise<void> {
  const L = await loadLeaflet()

  _state.panel = document.createElement("div")
  _state.panel.className = "map-panel"
  _state.panel.id = "map-overlay"
  _state.panel.innerHTML = `
    <div class="map-panel-header">
      <h2>${escapeHtml(t("map.title") ?? "Map")}</h2>
      <button class="icon-btn" id="map-close">${icons.x}</button>
    </div>
    <div class="map-container" id="peckish-map"></div>
  `
  _state.backdrop = document.createElement("div")
  _state.backdrop.className = "map-backdrop"
  _state.backdrop.addEventListener("click", closeMapPanel)
  document.body.appendChild(_state.backdrop)
  document.body.appendChild(_state.panel)

  const isDesktopNow = isDesktop()
  if (isDesktopNow) {
    const saved = localStorage.getItem(LS_KEY_WIDTH)
    if (saved) _state.panel.style.width = saved + "px"
  } else {
    const saved = localStorage.getItem(LS_KEY_HEIGHT)
    if (saved) _state.panel.style.height = saved + "px"
  }

  _state.panel.querySelector("#map-close")?.addEventListener("click", closeMapPanel)

  const container = _state.panel.querySelector("#peckish-map") as HTMLElement
  _state.map = L.map(container, { zoomControl: false }).setView(
    [config.map.center.lat, config.map.center.lon],
    config.map.zoom,
  )
  initTileLayer()

  const handle = document.createElement("div")
  handle.className = "map-drag-handle"
  handle.innerHTML = '<div class="map-drag-pill"></div><div class="map-drag-pill"></div><div class="map-drag-pill"></div>'
  _state.panel.insertBefore(handle, _state.panel.firstChild)

  setupDragResize(handle)
  createMarkers(L)
}

function setupDragResize(handle: HTMLElement): void {
  let _dragging = false
  let _dragStartY = 0
  let _dragStartH = 0
  let _dragStartX = 0
  let _dragStartW = 0
  let _resizeRaf = 0

  const MIN_WIDTH = 280
  const MAX_WIDTH_RATIO = 0.55
  const MIN_HEIGHT_RATIO = 0.2
  const MAX_HEIGHT_RATIO = 0.85

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    _dragging = true
    handle.setPointerCapture(e.pointerId)
    _state.panel!.style.transition = "none"
    if (isDesktop()) {
      _dragStartX = e.clientX
      _dragStartW = _state.panel!.offsetWidth
    } else {
      _dragStartY = e.clientY
      _dragStartH = _state.panel!.offsetHeight
    }
    e.preventDefault()
  })

  handle.addEventListener("pointermove", (e: PointerEvent) => {
    if (!_dragging || !_state.panel) return
    if (isDesktop()) {
      const delta = _dragStartX - e.clientX
      const newW = Math.min(Math.max(_dragStartW + delta, MIN_WIDTH), window.innerWidth * MAX_WIDTH_RATIO)
      _state.panel.style.width = newW + "px"
    } else {
      const delta = _dragStartY - e.clientY
      const newH = Math.min(
        Math.max(_dragStartH + delta, window.innerHeight * MIN_HEIGHT_RATIO),
        window.innerHeight * MAX_HEIGHT_RATIO,
      )
      _state.panel.style.height = newH + "px"
    }
    if (!_resizeRaf) {
      _resizeRaf = requestAnimationFrame(() => {
        _state.map?.invalidateSize()
        _resizeRaf = 0
      })
    }
  })

  const stopDrag = () => {
    if (!_dragging) return
    _dragging = false
    if (_resizeRaf) { cancelAnimationFrame(_resizeRaf); _resizeRaf = 0 }
    if (_state.panel) {
      _state.panel.style.transition = ""
      if (isDesktop()) {
        localStorage.setItem(LS_KEY_WIDTH, String(_state.panel.offsetWidth))
      } else {
        localStorage.setItem(LS_KEY_HEIGHT, String(_state.panel.offsetHeight))
      }
    }
  }
  handle.addEventListener("pointerup", stopDrag)
  handle.addEventListener("lostpointercapture", stopDrag)
}

function createMarkers(L: typeof L_NS): void {
  for (const r of _state.restaurants) {
    if (!r.coordinates) continue
    const popupParts = [`<strong>${escapeHtml(r.title)}</strong>`]
    if (r.cuisine?.length) popupParts.push(r.cuisine.map(escapeHtml).join(" · "))
    if (r.availableDays?.length) popupParts.push(`<em>${escapeHtml(formatAvailableDays(r.availableDays))}</em>`)
    const badges = BADGES.filter((b) => r[b.prop]).map((b) => escapeHtml(t(b.i18n)))
    if (badges.length) popupParts.push(badges.join(" · "))

    const divIcon = L.divIcon({
      className: "map-marker",
      html: restaurantIconSpan(r.icon, "map-marker-icon"),
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    })

    const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon: divIcon })
      .addTo(_state.map!)
      .bindPopup(popupParts.join("<br>"))
    _state.markers.set(r.id, marker)

    marker.on("click", () => {
      closeMapPanel()
      const el = document.querySelector(`[data-restaurant-id="${CSS.escape(r.id)}"]`) as HTMLElement | null
      if (el) flashAndScroll(el)
    })
  }
}

function initTileLayer(): void {
  if (!_state.map || !L) return
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(_state.map)
}

export async function flyToRestaurant(restaurantId: string): Promise<void> {
  if (!_state.visible) await openMapPanel()

  const marker = _state.markers.get(restaurantId)
  if (marker && _state.map) {
    const latLng = marker.getLatLng()
    _state.map.flyTo(latLng, 17, { duration: 0.8 })
    _state.map.once("moveend", () => marker.openPopup())
  }
}

// Close map panel on mobile/desktop layout transition
matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).addEventListener("change", () => {
  if (_state.visible) closeMapPanel()
})
