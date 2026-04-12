import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { markSaving, markSaved, clearAll, hasPending } from "./vote-indicator"

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom may not implement CSS.escape - polyfill with identity for test IDs that need no escaping
  if (typeof globalThis.CSS === "undefined" || !globalThis.CSS.escape) {
    Object.assign(globalThis, { CSS: { escape: (s: string) => s } })
  }
  document.body.innerHTML = `
    <div class="day-section" data-day-index="0">
      <button class="vote-btn" data-vote-id="mano"></button>
      <button class="vote-btn" data-vote-id="baobar"></button>
    </div>
  `
})

afterEach(() => {
  clearAll()
  vi.useRealTimers()
})

describe("markSaving", () => {
  it("adds vote-saving class to the matching button", () => {
    markSaving("mano", 0)
    const btn = document.querySelector('.vote-btn[data-vote-id="mano"]')!
    expect(btn.classList.contains("vote-saving")).toBe(true)
  })

  it("tracks pending state", () => {
    expect(hasPending()).toBe(false)
    markSaving("mano", 0)
    expect(hasPending()).toBe(true)
  })
})

describe("markSaved", () => {
  it("replaces vote-saving with vote-saved on pending buttons", () => {
    markSaving("mano", 0)
    markSaved()
    const btn = document.querySelector('.vote-btn[data-vote-id="mano"]')!
    expect(btn.classList.contains("vote-saving")).toBe(false)
    expect(btn.classList.contains("vote-saved")).toBe(true)
  })

  it("removes vote-saved after SAVED_DISPLAY_MS", () => {
    markSaving("mano", 0)
    markSaved()
    const btn = document.querySelector('.vote-btn[data-vote-id="mano"]')!
    expect(btn.classList.contains("vote-saved")).toBe(true)
    vi.advanceTimersByTime(1500)
    expect(btn.classList.contains("vote-saved")).toBe(false)
  })

  it("clears pending state", () => {
    markSaving("mano", 0)
    markSaved()
    expect(hasPending()).toBe(false)
  })
})

describe("clearAll", () => {
  it("removes all saving state and classes", () => {
    markSaving("mano", 0)
    markSaving("baobar", 0)
    clearAll()
    expect(hasPending()).toBe(false)
    const btns = document.querySelectorAll(".vote-saving")
    expect(btns.length).toBe(0)
  })
})
