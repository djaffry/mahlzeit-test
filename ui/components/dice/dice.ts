import "./dice.css"
import type { Restaurant } from "../../types"
import { isAvailableOnDay, isDataFromCurrentWeek, isWeekend, isoToWeekdayIndex } from "../../utils/date"
import { todayIso } from "../../utils/today"
import { prefersReducedMotion, persistentHighlight } from "../../utils/dom"
import { haptic } from "../../utils/haptic"
/* ── Constants ──────────────────────────────────────────── */

const DICE_EMOJI = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
const ANIMATION_MS = 1500
const ROLL_COOLDOWN_MS = 2000
const SHAKE_THRESHOLD = 45
const SHAKE_COUNT_NEEDED = 2
const SHAKE_COUNT_WINDOW_MS = 800
const SHAKE_COUNT_GAP_MS = 200
const SHAKE_COOLDOWN_MS = 1500

const EXCLUDE_CAT_RE = /dessert|kuchen|cake|nachspeise|obst|fruit|süß|sweet|suppe|soup|beilage|side/i

const HAPTIC_THROW = [50, 30, 80]
const HAPTIC_ROLLING = [20, 40, 20, 40, 20, 40, 20]
const HAPTIC_SETTLING = [15, 60, 15, 80, 10]
const HAPTIC_LANDING = [100]

/* ── State ──────────────────────────────────────────────── */

const _state = {
  getAllRestaurants: null as (() => Restaurant[]) | null,
  expandDay: null as ((index: number, opts?: { scroll?: boolean }) => void) | null,
  overlayEl: null as HTMLElement | null,
  rolling: false,
  lastShakeMs: 0,
  shakeCount: 0,
  firstShakeMs: 0,
  lastCountedShakeMs: 0,
}

/* ── Setup ──────────────────────────────────────────────── */

export function setup(deps: {
  getAllRestaurants: () => Restaurant[]
  expandDay: (index: number, opts?: { scroll?: boolean }) => void
}): void {
  _state.getAllRestaurants = deps.getAllRestaurants
  _state.expandDay = deps.expandDay

  _state.overlayEl = document.getElementById("dice-overlay")
  if (!_state.overlayEl) {
    _state.overlayEl = document.createElement("div")
    _state.overlayEl.className = "dice-overlay"
    _state.overlayEl.id = "dice-overlay"
    document.body.appendChild(_state.overlayEl)
  }
  _state.overlayEl.hidden = true

  setupShakeDetection()
}

/* ── Shake Detection ────────────────────────────────────── */

function setupShakeDetection(): void {
  if (!("DeviceMotionEvent" in window)) return

  // iOS 13+ requires permission
  const DME = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>
  }
  if (typeof DME.requestPermission === "function") {
    // Request on first user interaction
    const requestOnce = () => {
      DME.requestPermission!().then((state) => {
        if (state === "granted") listenShake()
      }).catch((e) => console.debug("[dice]", e))
      document.removeEventListener("touchstart", requestOnce, true)
      document.removeEventListener("click", requestOnce, true)
    }
    document.addEventListener("touchstart", requestOnce, { once: true, capture: true })
    document.addEventListener("click", requestOnce, { once: true, capture: true })
  } else {
    listenShake()
  }
}

function listenShake(): void {
  window.addEventListener("devicemotion", (e) => {
    if (_state.rolling) return
    const acc = e.accelerationIncludingGravity
    if (!acc) return
    const total = Math.abs(acc.x ?? 0) + Math.abs(acc.y ?? 0) + Math.abs(acc.z ?? 0)
    if (total > SHAKE_THRESHOLD) {
      const now = Date.now()
      if (now - _state.lastShakeMs < SHAKE_COOLDOWN_MS) return

      if (now - _state.firstShakeMs > SHAKE_COUNT_WINDOW_MS) {
        _state.shakeCount = 0
        _state.firstShakeMs = now
        _state.lastCountedShakeMs = 0
      }
      if (now - _state.lastCountedShakeMs < SHAKE_COUNT_GAP_MS) return
      _state.lastCountedShakeMs = now
      _state.shakeCount++

      if (_state.shakeCount >= SHAKE_COUNT_NEEDED) {
        _state.lastShakeMs = now
        _state.shakeCount = 0
        roll()
      }
    }
  }, { passive: true })
}

/* ── Roll ───────────────────────────────────────────────── */

export function isAvailable(): boolean {
  if (!_state.getAllRestaurants) return false
  if (isWeekend(todayIso())) return false
  const menuRestaurants = _state.getAllRestaurants().filter(r => r.type !== "link")
  return isDataFromCurrentWeek(menuRestaurants)
}

export function roll(): void {
  if (_state.rolling || !isAvailable()) return

  const allRestaurants = _state.getAllRestaurants!()
  const today = todayIso()
  const todayIdx = isoToWeekdayIndex(today)

  type Candidate =
    | { type: "item"; restaurantId: string; catIdx: number; itemIdx: number }
    | { type: "link"; restaurantId: string }

  const candidates: Candidate[] = []

  // Menu items (excluding dessert/soup/side categories)
  for (const r of allRestaurants) {
    if (r.type === "link") continue
    const menu = r.days?.[today]
    if (!menu?.categories?.length) continue
    for (let ci = 0; ci < menu.categories.length; ci++) {
      const cat = menu.categories[ci]
      if (EXCLUDE_CAT_RE.test(cat.name ?? "")) continue
      for (let ii = 0; ii < cat.items.length; ii++) {
        candidates.push({ type: "item", restaurantId: r.id, catIdx: ci, itemIdx: ii })
      }
    }
  }

  // Link restaurants available today
  for (const r of allRestaurants) {
    if (r.type !== "link") continue
    if (!isAvailableOnDay(r, today)) continue
    candidates.push({ type: "link", restaurantId: r.id })
  }

  if (candidates.length === 0) return

  const pick = candidates[Math.floor(Math.random() * candidates.length)]

  if (!_state.expandDay) return
  _state.rolling = true
  _state.expandDay(todayIdx, { scroll: false })

  haptic(HAPTIC_THROW)
  showOverlay()

  setTimeout(() => haptic(HAPTIC_ROLLING), 200)
  setTimeout(() => haptic(HAPTIC_SETTLING), 800)
  setTimeout(() => { _state.rolling = false }, ROLL_COOLDOWN_MS)

  setTimeout(() => {
    haptic(HAPTIC_LANDING)
    hideOverlay()

    requestAnimationFrame(() => {
      const section = document.getElementById(`r-${todayIdx}-${pick.restaurantId}`)
      if (!section) return
      if (pick.type === "link") {
        persistentHighlight(section, "dice-pick")
      } else {
        const item = section.querySelector(
          `.menu-item[data-cat-idx="${pick.catIdx}"][data-item-idx="${pick.itemIdx}"]`,
        ) as HTMLElement | null
        persistentHighlight(item ?? section, "dice-pick")
      }
    })
  }, ANIMATION_MS)
}

/* ── Overlay Animation ──────────────────────────────────── */

function showOverlay(): void {
  if (!_state.overlayEl) return

  if (prefersReducedMotion()) {
    // Skip animation entirely - just show briefly
    _state.overlayEl.hidden = false
    _state.overlayEl.textContent = DICE_EMOJI[Math.floor(Math.random() * 6)]
    _state.overlayEl.classList.add("visible")
    return
  }

  _state.overlayEl.innerHTML = DICE_EMOJI.map(
    (d, i) => `<span class="dice-face" style="--dice-i:${i}">${d}</span>`,
  ).join("")
  _state.overlayEl.hidden = false

  // Force reflow then add visible class for transition
  void _state.overlayEl.offsetHeight
  _state.overlayEl.classList.add("visible")
}

function hideOverlay(): void {
  if (!_state.overlayEl) return
  _state.overlayEl.classList.remove("visible")
  // Wait for fade-out transition
  setTimeout(() => {
    if (_state.overlayEl) {
      _state.overlayEl.hidden = true
      _state.overlayEl.innerHTML = ""
    }
  }, 200)
}
