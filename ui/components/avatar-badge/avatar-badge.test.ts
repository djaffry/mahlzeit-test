import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../voting/init", () => ({
  isVotingActive: vi.fn(() => false),
  isInNonDefaultRoom: vi.fn(() => false),
  hasConsented: vi.fn(() => false),
}))
vi.mock("../../voting/user-identity", () => ({
  getOrCreateIdentity: vi.fn(() => ({
    pubkey: "testpubkey",
    avatar: { color: "#aabbcc", label: "Friendly Fox" },
  })),
}))
vi.mock("../../voting/avatars", () => ({
  avatarSvg: vi.fn(() => "<svg>avatar</svg>"),
}))
vi.mock("../../i18n/i18n", () => ({ t: (k: string) => k }))
vi.mock("../../utils/dom", () => ({ escapeHtml: (s: string) => s }))

import { showAvatarBadge } from "./avatar-badge"
import { isVotingActive, isInNonDefaultRoom, hasConsented } from "../../voting/init"
import { getOrCreateIdentity } from "../../voting/user-identity"

function createBadgeElement(): HTMLElement {
  const el = document.createElement("div")
  el.id = "avatar-badge"
  el.hidden = true
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ""
  vi.mocked(isVotingActive).mockReturnValue(false)
  vi.mocked(isInNonDefaultRoom).mockReturnValue(false)
  vi.mocked(hasConsented).mockReturnValue(false)
  vi.mocked(getOrCreateIdentity).mockReturnValue({
    pubkey: "testpubkey",
    avatar: { color: "#aabbcc", label: "Friendly Fox" } as never,
    secretKey: new Uint8Array(),
  })
})

describe("showAvatarBadge", () => {
  it("does nothing if #avatar-badge element does not exist", () => {
    expect(() => showAvatarBadge()).not.toThrow()
  })

  it("sets badge hidden to false when element exists", () => {
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.hidden).toBe(false)
  })

  it("sets the --avatar-color CSS variable from identity", () => {
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.style.getPropertyValue("--avatar-color")).toBe("#aabbcc")
  })

  it("sets badge title to avatar label", () => {
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.title).toBe("Friendly Fox")
  })

  it("shows claim label when voting is not active and user has not consented", () => {
    vi.mocked(isVotingActive).mockReturnValue(false)
    vi.mocked(hasConsented).mockReturnValue(false)
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.innerHTML).toContain("avatar-badge-claim-label")
    expect(badge.innerHTML).toContain("voting.claim")
    expect(badge.classList.contains("avatar-badge-claim")).toBe(true)
  })

  it("does NOT show claim label when voting is active", () => {
    vi.mocked(isVotingActive).mockReturnValue(true)
    vi.mocked(hasConsented).mockReturnValue(false)
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.innerHTML).not.toContain("avatar-badge-claim-label")
    expect(badge.classList.contains("avatar-badge-claim")).toBe(false)
  })

  it("does NOT show claim label when user has consented", () => {
    vi.mocked(isVotingActive).mockReturnValue(false)
    vi.mocked(hasConsented).mockReturnValue(true)
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.innerHTML).not.toContain("avatar-badge-claim-label")
    expect(badge.classList.contains("avatar-badge-claim")).toBe(false)
  })

  it("adds has-room class when in a non-default room", () => {
    vi.mocked(isInNonDefaultRoom).mockReturnValue(true)
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.classList.contains("has-room")).toBe(true)
  })

  it("does not add has-room class when in default room", () => {
    vi.mocked(isInNonDefaultRoom).mockReturnValue(false)
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.classList.contains("has-room")).toBe(false)
  })

  it("renders avatar icon and label in innerHTML", () => {
    const badge = createBadgeElement()
    showAvatarBadge()
    expect(badge.innerHTML).toContain("avatar-badge-icon")
    expect(badge.innerHTML).toContain("avatar-badge-label")
    expect(badge.innerHTML).toContain("Friendly Fox")
  })
})
