import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { setupHeaderScroll } from "./header-scroll"

function setScrollY(value: number): void {
  Object.defineProperty(window, "scrollY", {
    value,
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  document.body.innerHTML = ""
  setScrollY(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("setupHeaderScroll", () => {
  it("does nothing if #header element does not exist", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")
    setupHeaderScroll()
    const scrollListeners = addEventListenerSpy.mock.calls.filter(([event]) => event === "scroll")
    expect(scrollListeners.length).toBe(0)
  })

  it("adds scrolled class when scrollY > 10", () => {
    document.body.innerHTML = `<div id="header"></div>`
    const header = document.getElementById("header")!

    // Override rAF to fire synchronously
    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    setupHeaderScroll()
    setScrollY(20)
    window.dispatchEvent(new Event("scroll"))

    expect(header.classList.contains("scrolled")).toBe(true)

    window.requestAnimationFrame = origRAF
  })

  it("removes scrolled class when scrollY <= 10", () => {
    document.body.innerHTML = `<div id="header" class="scrolled"></div>`
    const header = document.getElementById("header")!

    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    setupHeaderScroll()
    setScrollY(5)
    window.dispatchEvent(new Event("scroll"))

    expect(header.classList.contains("scrolled")).toBe(false)

    window.requestAnimationFrame = origRAF
  })

  it("does not add scrolled class when scrollY is exactly 10", () => {
    document.body.innerHTML = `<div id="header"></div>`
    const header = document.getElementById("header")!

    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    setupHeaderScroll()
    setScrollY(10)
    window.dispatchEvent(new Event("scroll"))

    expect(header.classList.contains("scrolled")).toBe(false)

    window.requestAnimationFrame = origRAF
  })

  it("adds scrolled class when scrollY is exactly 11", () => {
    document.body.innerHTML = `<div id="header"></div>`
    const header = document.getElementById("header")!

    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => { cb(0); return 0 }

    setupHeaderScroll()
    setScrollY(11)
    window.dispatchEvent(new Event("scroll"))

    expect(header.classList.contains("scrolled")).toBe(true)

    window.requestAnimationFrame = origRAF
  })
})
