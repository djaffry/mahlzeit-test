/* Dice roll — pick a random menu item or restaurant card */

import { isOverlayOpen, prefersReducedMotion } from "../utils/dom"
import { haptic } from "../utils/haptic"
import "../styles/dice.css"

const SHAKE_THRESHOLD = 25
const SHAKE_COOLDOWN = 1500
const ANIMATION_DURATION = 1500
const DICE_COUNT = 6

let _rolling = false
let _setup = false

let _smoothScrollTo: (el: HTMLElement) => void
let _saveCollapsed: () => void
let _getActivePanel: () => HTMLElement | null

export function setup(deps: {
  smoothScrollTo: (el: HTMLElement) => void
  saveCollapsed: () => void
  getActivePanel: () => HTMLElement | null
}): void {
  _smoothScrollTo = deps.smoothScrollTo
  _saveCollapsed = deps.saveCollapsed
  _getActivePanel = deps.getActivePanel

  const btn = document.getElementById('dice-btn')
  if (!btn || _setup) return
  _setup = true

  btn.addEventListener('click', () => roll())

  setupShake(btn)

  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase()
    if (k !== 'd' && k !== ' ') return
    if ((e.target as Element).closest('input, textarea, [contenteditable]')) return
    if (isOverlayOpen()) return
    if (k === ' ') e.preventDefault()
    roll()
  })
}

export function roll(pickIndex?: number): HTMLElement | null {
  if (_rolling) return null

  const pool = getPool()
  if (pool.length === 0) return null

  const idx = pickIndex ?? Math.floor(Math.random() * pool.length)
  const pick = pool[idx]

  const reducedMotion = prefersReducedMotion()

  vibrateRoll()
  document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'))

  if (reducedMotion) {
    revealPick(pick)
  } else {
    _rolling = true
    showOverlay()
    setTimeout(() => {
      hideOverlay()
      revealPick(pick)
      _rolling = false
    }, ANIMATION_DURATION)
  }

  return pick
}

function revealPick(pick: HTMLElement): void {
  // Stale pick guard: element may have been removed during animation
  if (!pick.isConnected) return

  const card = pick.closest('.restaurant-card') as HTMLElement | null || pick
  if (card.classList.contains('collapsed')) {
    card.classList.remove('collapsed')
    _saveCollapsed()
  }

  pick.classList.add('dice-pick')
  const isCard = pick.classList.contains('restaurant-card')
  setTimeout(() => {
    if (isCard) _smoothScrollTo(pick)
    else pick.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 100)
}

function randomWanderPath(): string {
  // Generate a cubic bezier curve from (0,0) to a random endpoint via random control points
  const rng = (min: number, max: number) => Math.round(min + Math.random() * (max - min))
  const ex = rng(-500, 500), ey = rng(-500, 500)
  const c1x = rng(-350, 350), c1y = rng(-350, 350)
  const c2x = rng(-350, 350), c2y = rng(-350, 350)
  return `"M 0 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}"`
}

function showOverlay(): void {
  const overlay = document.getElementById('dice-overlay')
  if (!overlay) return
  overlay.innerHTML = ''
  for (let i = 0; i < DICE_COUNT; i++) {
    const span = document.createElement('span')
    span.className = 'dice-overlay-emoji'
    span.role = 'img'
    span.ariaLabel = 'Rolling dice'
    span.textContent = '🎲'
    span.style.setProperty('--dice-x', (45 + Math.random() * 10) + '%')
    span.style.setProperty('--dice-y', (45 + Math.random() * 10) + '%')
    span.style.setProperty('--dice-size', (1.8 + Math.random() * 2.2) + 'rem')
    span.style.setProperty('--tumble-dur', (1.2 + Math.random() * 0.4) + 's')
    span.style.setProperty('--tumble-delay', (Math.random() * 0.15) + 's')
    span.style.setProperty('--wander-path', randomWanderPath())
    overlay.appendChild(span)
  }
  overlay.classList.add('visible')
}

function hideOverlay(): void {
  const overlay = document.getElementById('dice-overlay')
  if (!overlay) return
  overlay.classList.remove('visible')
  overlay.innerHTML = ''
}

const SKIP_CATEGORIES = /suppe|dessert|kuchen|torten|obst|nachspeise/i

export function getPool(): HTMLElement[] {
  const panel = _getActivePanel()
  if (!panel) return []

  const menuItems = [...panel.querySelectorAll<HTMLElement>('.menu-item:not(.hidden)')]
    .filter(el => {
      if (el.closest('.restaurant-card')?.querySelector('.reservation-badge')) return false
      const cat = el.closest('.category')?.querySelector('.category-title')?.textContent
      if (cat && SKIP_CATEGORIES.test(cat)) return false
      return true
    })

  const linkCards = [...panel.querySelectorAll<HTMLElement>('.restaurant-card:not(.link-muted):not(.map-card)')]
    .filter(card => !card.querySelector('.menu-item') && !card.querySelector('.reservation-badge'))

  return [...menuItems, ...linkCards]
}

function vibrateRoll(): void {
  const r = (min: number, max: number) => min + Math.floor(Math.random() * (max - min))
  haptic([
    // Phase 1: the throw — intense, rapid
    r(20,30), r(15,25), r(20,30), r(15,25), r(18,28), r(15,25),
    r(18,28), r(20,30), r(16,24), r(20,30), r(16,24), r(20,30),
    // Phase 2: rolling — losing energy
    r(12,18), r(35,50), r(12,18), r(40,55), r(10,16), r(45,60),
    r(10,16), r(50,65),
    // Phase 3: settling — faint ticks
    r(6,10), r(70,90), r(5,8), r(80,100), r(4,6), r(90,110),
    // Phase 4: landing
    r(40,60),
  ])
}

function setupShake(btn: HTMLElement): void {
  if (!window.DeviceMotionEvent) return
  // Skip on desktop — avoids Firefox "motion sensor deprecated" warning
  if (!('ontouchstart' in window) && navigator.maxTouchPoints <= 0) return

  let lastShake = 0
  let listening = false

  function onMotion(e: DeviceMotionEvent): void {
    const acc = e.accelerationIncludingGravity
    if (!acc) return
    const force = Math.abs(acc.x ?? 0) + Math.abs(acc.y ?? 0) + Math.abs(acc.z ?? 0) - 9.81
    if (force < SHAKE_THRESHOLD) return
    const now = Date.now()
    if (now - lastShake < SHAKE_COOLDOWN) return
    lastShake = now
    haptic(50)
    roll()
  }

  function startListening(): void {
    if (listening) return
    listening = true
    window.addEventListener('devicemotion', onMotion)
  }

  if (typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
    // iOS Safari: retry on each click until granted
    btn.addEventListener('click', () => {
      if (listening) return
      ;(DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission()
        .then(state => {
          if (state === 'granted') startListening()
        })
        .catch(() => {})
    })
  } else {
    startListening()
  }
}
