import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { UserVote, VotingData } from "./types"
import type { Restaurant } from "../types"

/* ── Mock nostr-client (no real Nostr network) ───────────── */

let mockVotes: Map<string, UserVote> = new Map()
const mockPublishVote = vi.fn().mockResolvedValue({ ok: 1, failed: 0 })
const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()
const mockDestroy = vi.fn()

vi.mock("./nostr-client", () => ({
  getVotes: () => mockVotes,
  publishVote: (...args: unknown[]) => mockPublishVote(...args),
  subscribe: (...args: unknown[]) => mockSubscribe(...args),
  unsubscribe: (...args: unknown[]) => mockUnsubscribe(...args),
  destroy: (...args: unknown[]) => mockDestroy(...args),
  obfuscateId: async (_salt: string, id: string) => `hash_${id}`,
  getRelayStatus: () => new Map([["wss://relay.test", true]]),
}))

/* ── Mock fetch for voting.json ──────────────────────────── */

const MOCK_VOTING_DATA: VotingData = {
  week: "2026-03-23",
  appId: "test-app",
  pubkey: "serverpub",
  salt: "testsalt",
  relays: ["wss://relay.test"],
  rooms: {
    "2026-03-23": { roomEventId: "room-mon" },
    "2026-03-24": { roomEventId: "room-tue" },
    "2026-03-25": { roomEventId: "room-wed" },
    "2026-03-26": { roomEventId: "room-thu" },
    "2026-03-27": { roomEventId: "room-fri" },
  },
}

const MOCK_RESTAURANTS: Restaurant[] = [
  { id: "mano", title: "Mano", url: "", type: "full", fetchedAt: "", error: null, days: {} },
  { id: "baobar", title: "Bao Bar", url: "", type: "full", fetchedAt: "", error: null, days: {} },
  { id: "dean", title: "Dean & David", url: "", type: "link", fetchedAt: "", error: null, days: {} },
]

/* ── Mock date to Wednesday of the voting week ───────────── */

vi.mock("../utils/date", () => ({
  getTodayName: () => "Mittwoch",
  getWeekDates: () => [],
  getMondayOfWeek: () => new Date("2026-03-23"),
}))

/* ── Import after mocks ──────────────────────────────────── */

import {
  initVoting,
  acceptVoting,
  isVotingActive,
  toggleVote,
  toggleAllVotes,
  getVotingCardHtml,
  destroyVoting,
  onDayChangeVoting,
} from "./voting-lifecycle"

/* ── Helpers ─────────────────────────────────────────────── */

function setupFetch(): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_VOTING_DATA),
  })
}

function fakeNow(dateStr: string): void {
  vi.useFakeTimers({ now: new Date(dateStr) })
}

const flush = () => vi.advanceTimersByTimeAsync(0)

/* ── Tests ───────────────────────────────────────────────── */

beforeEach(() => {
  mockVotes = new Map()
  mockPublishVote.mockClear()
  mockSubscribe.mockClear()
  mockUnsubscribe.mockClear()
  mockDestroy.mockClear()
  setupFetch()
  localStorage.setItem("forkcast:votingOptIn", "true")
  document.body.innerHTML = ""
})

afterEach(() => {
  destroyVoting()
  vi.useRealTimers()
})

describe("initVoting", () => {
  it("activates when today is within the voting week", async () => {
    fakeNow("2026-03-25T12:00:00Z") // Wednesday
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
  })

  it("activates in read-only mode on weekends", async () => {
    fakeNow("2026-03-28T12:00:00Z") // Saturday
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
    const html = getVotingCardHtml("Montag")
    expect(html).toContain("voting-past")
  })

  it("subscribes to today's date on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      "2026-03-25",
      expect.any(Function)
    )
  })

  it("does not activate when fetch fails", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"))
    await initVoting(MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
  })

  it("does not activate when response is not ok", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
    await initVoting(MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
  })

  it("includes link restaurants in voting options", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("Dean &amp; David")
  })
})

describe("toggleVote", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
  })

  it("marks a restaurant as voted in the rendered card", () => {
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-btn-active")
  })

  it("untoggles a previously voted restaurant", () => {
    toggleVote("mano")
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(0)
  })

  it("debounces publish (does not publish immediately)", () => {
    toggleVote("mano")
    expect(mockPublishVote).not.toHaveBeenCalled()
  })

  it("publishes after debounce period", async () => {
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      "2026-03-25",
      expect.any(Uint8Array),
      ["hash_mano"]
    )
  })

  it("consolidates rapid clicks into a single publish", async () => {
    toggleVote("mano")
    toggleVote("baobar")
    toggleVote("dean")
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toContain("hash_mano")
    expect(hashedIds).toContain("hash_baobar")
    expect(hashedIds).toContain("hash_dean")
  })

  it("sends only final state after toggle-on then toggle-off", async () => {
    toggleVote("mano")
    toggleVote("baobar")
    toggleVote("mano") // undo mano
    await vi.advanceTimersByTimeAsync(1100)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toEqual(["hash_baobar"])
  })

  it("includes user in vote count optimistically", () => {
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    // The vote count for mano should show (the user's own vote)
    expect(html).toContain("Mano")
    // The row with voting-btn-active should exist
    expect(html).toContain("voting-btn-active")
  })
})

describe("publish failure handling", () => {
  function injectDayPanel(): void {
    const panel = document.createElement("div")
    panel.className = "day-panel"
    panel.dataset.panel = "Mittwoch"
    document.body.appendChild(panel)
    const grid = document.createElement("div")
    grid.className = "restaurant-grid"
    panel.appendChild(grid)
    const mapCard = document.createElement("div")
    mapCard.className = "map-card"
    grid.appendChild(mapCard)
  }

  it("shows failed indicator when all relays reject", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    injectDayPanel()
    await initVoting(MOCK_RESTAURANTS)
    await flush()

    mockPublishVote.mockResolvedValueOnce({ ok: 0, failed: 1 })
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)

    const failedIndicators = document.querySelectorAll(".voting-status-failed")
    expect(failedIndicators.length).toBeGreaterThan(0)
  })

  it("clears failed indicator after timeout", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    injectDayPanel()
    await initVoting(MOCK_RESTAURANTS)
    await flush()

    mockPublishVote.mockResolvedValueOnce({ ok: 0, failed: 1 })
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)
    expect(document.querySelectorAll(".voting-status-failed").length).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(4100)
    expect(document.querySelectorAll(".voting-status-failed").length).toBe(0)
  })

  it("shows sent indicator on partial success", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    injectDayPanel()
    await initVoting(MOCK_RESTAURANTS)
    await flush()

    mockPublishVote.mockResolvedValueOnce({ ok: 1, failed: 2 })
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)

    const sentIndicators = document.querySelectorAll(".voting-status-sent")
    expect(sentIndicators.length).toBeGreaterThan(0)
    expect(document.querySelectorAll(".voting-status-failed").length).toBe(0)
  })
})

describe("toggleAllVotes", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
  })

  it("selects all restaurants", () => {
    toggleAllVotes()
    const html = getVotingCardHtml("Mittwoch")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(3)
  })

  it("deselects all when all are already selected", () => {
    toggleAllVotes() // select all
    toggleAllVotes() // deselect all
    const html = getVotingCardHtml("Mittwoch")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(0)
  })

  it("publishes all hashed IDs after debounce", async () => {
    toggleAllVotes()
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toHaveLength(3)
    expect(hashedIds).toContain("hash_mano")
    expect(hashedIds).toContain("hash_baobar")
    expect(hashedIds).toContain("hash_dean")
  })
})

describe("getVotingCardHtml", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
  })

  it("returns HTML for a valid day", () => {
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-card")
    expect(html).toContain("Mano")
    expect(html).toContain("Bao Bar")
    expect(html).toContain("Dean &amp; David")
  })

  it("returns empty string for invalid day", () => {
    expect(getVotingCardHtml("Samstag")).toBe("")
  })

  it("returns empty string when not active", async () => {
    destroyVoting()
    expect(getVotingCardHtml("Mittwoch")).toBe("")
  })

  it("sorts restaurants by vote count descending", () => {
    const pubkey1 = "a".repeat(64)
    const pubkey2 = "b".repeat(64)
    mockVotes.set(pubkey1, { pubkey: pubkey1, votes: ["hash_baobar"], createdAt: 1 })
    mockVotes.set(pubkey2, { pubkey: pubkey2, votes: ["hash_baobar"], createdAt: 2 })
    const html = getVotingCardHtml("Mittwoch")
    const baoIdx = html.indexOf("Bao Bar")
    const manoIdx = html.indexOf("Mano")
    expect(baoIdx).toBeLessThan(manoIdx)
  })
})

describe("onDayChangeVoting", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    mockSubscribe.mockClear()
    mockUnsubscribe.mockClear()
  })

  it("unsubscribes from previous day and subscribes to new day", () => {
    onDayChangeVoting(0) // Monday
    expect(mockUnsubscribe).toHaveBeenCalled()
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      "2026-03-23",
      expect.any(Function)
    )
  })

  it("clears user votes on day change", () => {
    toggleVote("mano")
    onDayChangeVoting(0) // Monday
    const html = getVotingCardHtml("Montag")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(0)
  })

  it("flushes pending publish before switching", async () => {
    toggleVote("mano") // starts debounce
    onDayChangeVoting(0) // should flush
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      "2026-03-25", // old date
      expect.any(Uint8Array),
      ["hash_mano"]
    )
  })
})

describe("optimistic reconciliation", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
  })

  it("adds user to voter count before relay echo", () => {
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    // Should contain the user's avatar in the mano row voters
    expect(html).toContain("voting-btn-active")
  })

  it("removes user from voter count on unvote before relay echo", () => {
    // Toggle on then off: reconciliation should remove user from tally
    toggleVote("mano")
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(0)
  })
})

describe("consent flow", () => {
  it("does not connect to relays without opt-in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("does not publish votes without opt-in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).not.toHaveBeenCalled()
  })

  it("shows consent card when not opted in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-consent")
    expect(html).toContain("voting-consent-accept")
  })

  it("consent card shows avatar badge with copy icon", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-identity")
    expect(html).toContain("voting-identity-copy")
    expect(html).toContain("voting-avatar")
  })

  it("consent card shows relay URLs", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("wss://relay.test")
    expect(html).toContain("voting-relay-list")
  })

  it("consent card does not show vote rows", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    const html = getVotingCardHtml("Mittwoch")
    expect(html).not.toContain("voting-row")
    expect(html).not.toContain("voting-btn")
  })

  it("connects after acceptVoting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)

    await acceptVoting()
    expect(isVotingActive()).toBe(true)
    expect(mockSubscribe).toHaveBeenCalled()
  })

  it("persists opt-in to localStorage", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    await acceptVoting()
    expect(localStorage.getItem("forkcast:votingOptIn")).toBe("true")
  })

  it("shows voting card after accepting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    await acceptVoting()
    const html = getVotingCardHtml("Mittwoch")
    expect(html).not.toContain("voting-consent")
    expect(html).toContain("voting-row")
    expect(html).toContain("Mano")
  })

  it("accepting twice is a no-op", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    await acceptVoting()
    mockSubscribe.mockClear()
    await acceptVoting()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("auto-connects when previously opted in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:votingOptIn", "true")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
    expect(mockSubscribe).toHaveBeenCalled()
    const html = getVotingCardHtml("Mittwoch")
    expect(html).not.toContain("voting-consent")
    expect(html).toContain("voting-row")
  })

  it("voting works after accepting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("forkcast:votingOptIn")
    await initVoting(MOCK_RESTAURANTS)
    await acceptVoting()
    toggleVote("mano")
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-btn-active")
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
  })
})

describe("destroyVoting", () => {
  it("resets all state", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)

    destroyVoting()
    expect(isVotingActive()).toBe(false)
    expect(getVotingCardHtml("Mittwoch")).toBe("")
  })
})
