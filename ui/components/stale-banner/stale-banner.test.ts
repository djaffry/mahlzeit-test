import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../utils/date", () => ({
  getTodayName: vi.fn(() => "Montag"),
  isDataFromCurrentWeek: vi.fn(() => true),
}))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../icons", () => ({ icons: { bird: "<svg>bird</svg>" } }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))
vi.mock("./stale-banner.css", () => ({}))

import { updateStaleBanner } from "./stale-banner"
import { getTodayName, isDataFromCurrentWeek } from "../../utils/date"

beforeEach(() => {
  document.body.innerHTML = `<div id="timeline"></div>`
  vi.mocked(getTodayName).mockReturnValue("Montag")
  vi.mocked(isDataFromCurrentWeek).mockReturnValue(true)
})

describe("updateStaleBanner", () => {
  it("does not add a banner when data is current and it is a weekday", () => {
    updateStaleBanner([])
    expect(document.getElementById("stale-banner")).toBeNull()
  })

  it("adds a weekend banner when getTodayName returns null", () => {
    vi.mocked(getTodayName).mockReturnValue(null)
    updateStaleBanner([])
    const banner = document.getElementById("stale-banner")
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain("weekend.banner")
  })

  it("adds a stale banner when isDataFromCurrentWeek returns false", () => {
    vi.mocked(isDataFromCurrentWeek).mockReturnValue(false)
    updateStaleBanner([])
    const banner = document.getElementById("stale-banner")
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain("stale.banner")
  })

  it("banner is inserted before the timeline element", () => {
    vi.mocked(isDataFromCurrentWeek).mockReturnValue(false)
    updateStaleBanner([])
    const timeline = document.getElementById("timeline")!
    const prev = timeline.previousElementSibling
    expect(prev).not.toBeNull()
    expect(prev!.id).toBe("stale-banner")
  })

  it("removes an existing banner before adding a new one", () => {
    // Inject a pre-existing banner
    const existing = document.createElement("div")
    existing.id = "stale-banner"
    document.body.prepend(existing)

    vi.mocked(isDataFromCurrentWeek).mockReturnValue(false)
    updateStaleBanner([])

    const banners = document.querySelectorAll("#stale-banner")
    expect(banners.length).toBe(1)
  })

  it("removes an existing banner and does not add a new one when not stale and not weekend", () => {
    const existing = document.createElement("div")
    existing.id = "stale-banner"
    document.body.prepend(existing)

    updateStaleBanner([])

    expect(document.getElementById("stale-banner")).toBeNull()
  })

  it("banner includes the bird icon", () => {
    vi.mocked(isDataFromCurrentWeek).mockReturnValue(false)
    updateStaleBanner([])
    const banner = document.getElementById("stale-banner")!
    expect(banner.innerHTML).toContain("<svg>bird</svg>")
  })

  it("banner has stale-banner class", () => {
    vi.mocked(isDataFromCurrentWeek).mockReturnValue(false)
    updateStaleBanner([])
    const banner = document.getElementById("stale-banner")!
    expect(banner.classList.contains("stale-banner")).toBe(true)
  })
})
