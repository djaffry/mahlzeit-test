import { describe, it, expect, vi, beforeEach } from "vitest"

/* ── Mocks ──────────────────────────────────────────────── */

vi.mock("./overlay.css", () => ({}))

const mockRegisterOverlay = vi.fn()
const mockUnregisterOverlay = vi.fn()

vi.mock("../../utils/dom", () => ({
  registerOverlay: (...args: unknown[]) => mockRegisterOverlay(...args),
  unregisterOverlay: (...args: unknown[]) => mockUnregisterOverlay(...args),
}))

vi.mock("../../constants", () => ({
  LANG_CHANGE_EVENT: "peckish:langchange",
}))

/* ── Import after mocks ─────────────────────────────────── */

import { openOverlay, closeAllOverlays } from "./overlay"

/* ── Tests ──────────────────────────────────────────────── */

describe("openOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("returns an object with panel (HTMLElement) and close (function)", () => {
    const { panel, close } = openOverlay()
    expect(panel).toBeInstanceOf(HTMLElement)
    expect(typeof close).toBe("function")
  })

  it("panel is appended to document.body", () => {
    openOverlay()
    // The overlay wrapper should be in the DOM
    expect(document.querySelector(".overlay-centered")).not.toBeNull()
  })

  it("panel is a child of the overlay-centered wrapper", () => {
    const { panel } = openOverlay()
    const overlay = document.querySelector(".overlay-centered")
    expect(overlay?.contains(panel)).toBe(true)
  })

  it("applies minWidth to panel when option is provided", () => {
    const { panel } = openOverlay({ minWidth: "400px" })
    expect(panel.style.minWidth).toBe("400px")
  })

  it("registers overlay with dom utility", () => {
    openOverlay()
    expect(mockRegisterOverlay).toHaveBeenCalledOnce()
    expect(mockRegisterOverlay.mock.calls[0][0]).toMatch(/^overlay-\d+$/)
  })

  it("calling close() removes the overlay from DOM", () => {
    const { close } = openOverlay()
    expect(document.querySelector(".overlay-centered")).not.toBeNull()
    close()
    expect(document.querySelector(".overlay-centered")).toBeNull()
  })

  it("calling close() calls unregisterOverlay", () => {
    const { close } = openOverlay()
    const overlayId = mockRegisterOverlay.mock.calls[0][0]
    close()
    expect(mockUnregisterOverlay).toHaveBeenCalledWith(overlayId)
  })

  it("calling close() triggers onClose callback", () => {
    const onClose = vi.fn()
    const { close } = openOverlay({ onClose })
    close()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("calling close() twice removes the overlay from the active set both times without error", () => {
    const onClose = vi.fn()
    const { close } = openOverlay({ onClose })
    close()
    // Second call is a no-op on the DOM (overlay already removed) but should not throw
    expect(() => close()).not.toThrow()
  })

  it("clicking the overlay backdrop (not the panel) closes the overlay", () => {
    const onClose = vi.fn()
    openOverlay({ onClose })
    const overlay = document.querySelector(".overlay-centered") as HTMLElement
    // Simulate click directly on the overlay (target === overlay)
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.querySelector(".overlay-centered")).toBeNull()
  })

  it("clicking inside the panel does not close when dismissable is not false", () => {
    const onClose = vi.fn()
    const { panel } = openOverlay({ onClose })
    // Click on the panel - target !== overlay wrapper
    panel.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("dismissable: false - clicking backdrop does not close", () => {
    const onClose = vi.fn()
    openOverlay({ onClose, dismissable: false })
    const overlay = document.querySelector(".overlay-centered") as HTMLElement
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector(".overlay-centered")).not.toBeNull()
  })

  it("registers onLangChange listener when provided", () => {
    const onLangChange = vi.fn()
    openOverlay({ onLangChange })
    document.dispatchEvent(new Event("peckish:langchange"))
    expect(onLangChange).toHaveBeenCalledOnce()
  })

  it("unregisters onLangChange listener after close", () => {
    const onLangChange = vi.fn()
    const { close } = openOverlay({ onLangChange })
    close()
    document.dispatchEvent(new Event("peckish:langchange"))
    expect(onLangChange).toHaveBeenCalledTimes(0)
  })

  it("each openOverlay call uses a unique overlay ID", () => {
    openOverlay()
    openOverlay()
    const id1 = mockRegisterOverlay.mock.calls[0][0]
    const id2 = mockRegisterOverlay.mock.calls[1][0]
    expect(id1).not.toBe(id2)
  })
})

describe("closeAllOverlays", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    mockRegisterOverlay.mockReset()
    mockUnregisterOverlay.mockReset()
  })

  it("closes all open overlays", () => {
    const onClose1 = vi.fn()
    const onClose2 = vi.fn()
    openOverlay({ onClose: onClose1 })
    openOverlay({ onClose: onClose2 })
    expect(document.querySelectorAll(".overlay-centered")).toHaveLength(2)
    closeAllOverlays()
    expect(onClose1).toHaveBeenCalledOnce()
    expect(onClose2).toHaveBeenCalledOnce()
    expect(document.querySelectorAll(".overlay-centered")).toHaveLength(0)
  })

  it("does nothing when no overlays are open", () => {
    expect(() => closeAllOverlays()).not.toThrow()
  })

  it("can be called multiple times without error", () => {
    openOverlay()
    closeAllOverlays()
    expect(() => closeAllOverlays()).not.toThrow()
  })
})
