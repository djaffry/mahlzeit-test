import { describe, it, expect, vi } from "vitest"

vi.mock("../../utils/dom", () => ({
  escapeHtml: (s: string) => s,
}))
vi.mock("../../i18n/i18n", () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}))
vi.mock("../../utils/date", () => ({
  formatDateTime: (d: Date) => d.toISOString(),
}))

import { renderFooter } from "./footer"

describe("renderFooter", () => {
  it("renders loaded time", () => {
    const el = document.createElement("div")
    renderFooter(null, el)
    expect(el.innerHTML).toContain("footer.loaded")
  })

  it("renders fetch time when provided", () => {
    const el = document.createElement("div")
    renderFooter("2026-04-10T12:00:00Z", el)
    expect(el.innerHTML).toContain("footer.fetched")
    expect(el.innerHTML).toContain("footer.loaded")
  })

  it("does not render fetch time when null", () => {
    const el = document.createElement("div")
    renderFooter(null, el)
    expect(el.innerHTML).not.toContain("footer.fetched")
  })

  it("replaces existing content on re-render", () => {
    const el = document.createElement("div")
    el.innerHTML = "<p>old</p>"
    renderFooter(null, el)
    expect(el.innerHTML).not.toContain("old")
    expect(el.innerHTML).toContain("footer.loaded")
  })
})
