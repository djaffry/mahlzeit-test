import { describe, it, expect, beforeEach, vi } from "vitest"
import { setup, getPool, roll } from "./dice"

// Suppress CSS import in test environment (vite handles this via ?inline or mocking)
// The dice.ts imports "../styles/dice.css" which jsdom ignores gracefully.

function createPanel(html: string): HTMLElement {
  const panel = document.createElement("div")
  panel.className = "day-panel"
  panel.dataset.panel = "Montag"
  panel.innerHTML = html
  document.body.appendChild(panel)
  return panel
}

function makeSetupDeps(panel: HTMLElement) {
  return {
    smoothScrollTo: vi.fn(),
    saveCollapsed: vi.fn(),
    getActivePanel: () => panel,
  }
}

describe("dice — getPool", () => {
  let panel: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = `
      <button class="dice-btn" id="dice-btn"></button>
      <div class="dice-overlay" id="dice-overlay" aria-hidden="true"></div>
    `
    // Mock scrollIntoView (not implemented in jsdom)
    Element.prototype.scrollIntoView = vi.fn()
    // Mock window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, // prefers-reduced-motion: reduce → no animation, simplifies roll tests
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it("returns empty array when panel has no items", () => {
    panel = createPanel("")
    setup(makeSetupDeps(panel))
    expect(getPool()).toEqual([])
  })

  it("finds visible menu items in restaurant cards", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item">Schnitzel</div>
          <div class="menu-item">Gulasch</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    expect(getPool()).toHaveLength(2)
  })

  it("excludes hidden menu items", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item">Schnitzel</div>
          <div class="menu-item hidden">Invisible</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    const pool = getPool()
    expect(pool).toHaveLength(1)
    expect(pool[0].textContent).toBe("Schnitzel")
  })

  it("excludes items from restaurants with reservation badge", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <span class="reservation-badge">Reservierung</span>
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item">Schnitzel</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    expect(getPool()).toHaveLength(0)
  })

  it("includes link cards (no menu items) as rollable entries", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <a href="https://example.com">Some Restaurant</a>
      </div>
    `)
    setup(makeSetupDeps(panel))
    const pool = getPool()
    expect(pool).toHaveLength(1)
    expect(pool[0].classList.contains("restaurant-card")).toBe(true)
  })

  it("excludes link-muted cards", () => {
    panel = createPanel(`
      <div class="restaurant-card link-muted">
        <a href="https://example.com">Muted Restaurant</a>
      </div>
    `)
    setup(makeSetupDeps(panel))
    expect(getPool()).toHaveLength(0)
  })

  it("excludes map cards", () => {
    panel = createPanel(`
      <div class="restaurant-card map-card">
        <a href="https://maps.example.com">Map</a>
      </div>
    `)
    setup(makeSetupDeps(panel))
    expect(getPool()).toHaveLength(0)
  })
})

describe("dice — roll", () => {
  let panel: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = `
      <button class="dice-btn" id="dice-btn"></button>
      <div class="dice-overlay" id="dice-overlay" aria-hidden="true"></div>
    `
    Element.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, // reduced motion → synchronous revealPick, no setTimeout delay
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it("returns null when pool is empty", () => {
    panel = createPanel("")
    setup(makeSetupDeps(panel))
    expect(roll()).toBeNull()
  })

  it("picks an item and adds dice-pick class", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item">Schnitzel</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    const picked = roll(0)
    expect(picked).not.toBeNull()
    expect(picked!.classList.contains("dice-pick")).toBe(true)
  })

  it("picks specific index when provided", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item" id="item-a">Item A</div>
          <div class="menu-item" id="item-b">Item B</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    const picked = roll(1)
    expect(picked!.id).toBe("item-b")
  })

  it("clears previous dice-pick before new pick", () => {
    panel = createPanel(`
      <div class="restaurant-card">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item" id="item-a">Item A</div>
          <div class="menu-item" id="item-b">Item B</div>
        </div>
      </div>
    `)
    setup(makeSetupDeps(panel))
    roll(0)
    roll(1)
    const picks = panel.querySelectorAll(".dice-pick")
    expect(picks).toHaveLength(1)
    expect((picks[0] as HTMLElement).id).toBe("item-b")
  })

  it("expands a collapsed restaurant card on pick", () => {
    panel = createPanel(`
      <div class="restaurant-card collapsed">
        <div class="category">
          <div class="category-title">Hauptgericht</div>
          <div class="menu-item">Schnitzel</div>
        </div>
      </div>
    `)
    const deps = makeSetupDeps(panel)
    setup(deps)
    roll(0)
    const card = panel.querySelector(".restaurant-card")!
    expect(card.classList.contains("collapsed")).toBe(false)
    expect(deps.saveCollapsed).toHaveBeenCalled()
  })
})
