import { describe, it, expect, vi } from "vitest"

vi.mock("../../i18n/i18n", () => ({ t: vi.fn((k: string) => k) }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("./empty-state.css", () => ({}))

import {
  renderLoadingState,
} from "./empty-state"

describe("renderLoadingState", () => {
  it("returns a string containing skeleton wrapper", () => {
    expect(renderLoadingState()).toContain('class="skeleton"')
  })

  it("includes exactly 8 skeleton lines", () => {
    const html = renderLoadingState()
    const matches = html.match(/class="skeleton-line /g)
    expect(matches).toHaveLength(8)
  })

  it("cycles through all three skeleton line widths", () => {
    const html = renderLoadingState()
    expect(html).toContain("skeleton-line-short")
    expect(html).toContain("skeleton-line-long")
    expect(html).toContain("skeleton-line-medium")
  })
})
