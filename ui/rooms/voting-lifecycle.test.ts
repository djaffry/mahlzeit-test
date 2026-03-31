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
  appId: "test-app",
  salt: "testsalt",
  relays: ["wss://relay.test"],
}

const MOCK_RESTAURANTS: Restaurant[] = [
  { id: "mano", title: "Mano", url: "", type: "full", fetchedAt: "", error: null, days: {} },
  { id: "baobar", title: "Bao Bar", url: "", type: "full", fetchedAt: "", error: null, days: {} },
  { id: "dean", title: "Dean & David", url: "", type: "link", fetchedAt: "", error: null, days: {} },
]

/* ── Mock date to Wednesday of the voting week ───────────── */

vi.mock("../utils/date", () => ({
  getTodayName: () => "Mittwoch",
  getWeekDates: () => [
    new Date("2026-03-23"),
    new Date("2026-03-24"),
    new Date("2026-03-25"),
    new Date("2026-03-26"),
    new Date("2026-03-27"),
  ],
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
  createRoom,
  joinRoom,
  switchToRoom,
  leaveRoom,
  getActiveRoom,
  getKnownRooms,
  encodeRoomPayload,
  setRoomListOpen,
  isRoomListOpen,
  setConfirmLeaveRoom,
  getConfirmLeaveRoomId,
  renameRoom,
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
  localStorage.removeItem("forkcast:rooms")
  localStorage.removeItem("forkcast:activeRoom")
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
      { type: "default", date: "2026-03-25" },
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
      { type: "default", date: "2026-03-25" },
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
      { type: "default", date: "2026-03-23" },
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
      { type: "default", date: "2026-03-25" }, // old date's target
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

describe("private rooms", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    mockSubscribe.mockClear()
    mockUnsubscribe.mockClear()
  })

  it("creates a room and switches to it", () => {
    const room = createRoom("Team A")
    expect(room.name).toBe("Team A")
    expect(room.id).toHaveLength(16)
    expect(getActiveRoom()).toBe(room)
    expect(getKnownRooms()).toContain(room)
  })

  it("generates unique room IDs", () => {
    const room1 = createRoom("Room 1")
    switchToRoom(null) // back to default so next create works
    const room2 = createRoom("Room 2")
    expect(room1.id).not.toBe(room2.id)
  })

  it("room ID is URL-safe", () => {
    const room = createRoom("Test")
    expect(room.id).toMatch(/^[A-Za-z0-9_-]{16}$/)
  })

  it("subscribes with private room target after creating", () => {
    const room = createRoom("Team A")
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: room.id, date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("unsubscribes from previous room when switching", () => {
    createRoom("Team A")
    mockUnsubscribe.mockClear()
    createRoom("Team B")
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it("persists rooms to localStorage", () => {
    createRoom("Team A")
    const stored = JSON.parse(localStorage.getItem("forkcast:rooms") ?? "[]")
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe("Team A")
  })

  it("persists active room ID to localStorage", () => {
    const room = createRoom("Team A")
    expect(localStorage.getItem("forkcast:activeRoom")).toBe(room.id)
  })

  it("removes active room key when switching to default", () => {
    createRoom("Team A")
    switchToRoom(null)
    expect(localStorage.getItem("forkcast:activeRoom")).toBeNull()
  })

  it("switches back to default room", () => {
    createRoom("Team A")
    mockSubscribe.mockClear()
    switchToRoom(null)
    expect(getActiveRoom()).toBeNull()
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("flushes pending votes when switching rooms", async () => {
    toggleVote("mano")
    createRoom("Team A") // should flush pending
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
  })

  it("flushes votes to the OLD room target before switching", async () => {
    toggleVote("mano")
    createRoom("Team A")
    // The flush should publish to the default room, not the new private room
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-25" },
      expect.any(Uint8Array),
      ["hash_mano"]
    )
  })

  it("clears user votes on room switch", () => {
    toggleVote("mano")
    createRoom("Team A")
    const html = getVotingCardHtml("Mittwoch")
    const activeCount = (html.match(/voting-btn-active/g) || []).length
    expect(activeCount).toBe(0)
  })

  it("leaves a room and returns to default", () => {
    const room = createRoom("Team A")
    mockSubscribe.mockClear()
    leaveRoom(room.id)
    expect(getActiveRoom()).toBeNull()
    expect(getKnownRooms()).toHaveLength(0)
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("leaving a non-active room keeps current room", () => {
    const roomA = createRoom("Team A")
    switchToRoom(null) // back to default
    const roomB = createRoom("Team B")
    mockSubscribe.mockClear()
    mockUnsubscribe.mockClear()
    leaveRoom(roomA.id)
    // Should still be in Team B, not switch
    expect(getActiveRoom()).toBe(roomB)
    expect(getKnownRooms()).toHaveLength(1)
    expect(getKnownRooms()[0].id).toBe(roomB.id)
    // No unsubscribe/subscribe should happen
    expect(mockUnsubscribe).not.toHaveBeenCalled()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("leaving removes room from localStorage", () => {
    const room = createRoom("Team A")
    leaveRoom(room.id)
    const stored = JSON.parse(localStorage.getItem("forkcast:rooms") ?? "[]")
    expect(stored).toHaveLength(0)
  })

  it("day switch preserves active room", () => {
    const room = createRoom("Team A")
    mockSubscribe.mockClear()
    onDayChangeVoting(0) // Monday
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: room.id, date: "2026-03-23" },
      expect.any(Function)
    )
  })

  it("supports multiple rooms", () => {
    createRoom("Team A")
    switchToRoom(null)
    createRoom("Team B")
    expect(getKnownRooms()).toHaveLength(2)
    expect(getKnownRooms()[0].name).toBe("Team A")
    expect(getKnownRooms()[1].name).toBe("Team B")
  })

  it("switches between private rooms", () => {
    const roomA = createRoom("Team A")
    switchToRoom(null)
    const roomB = createRoom("Team B")
    mockSubscribe.mockClear()
    switchToRoom(roomA)
    expect(getActiveRoom()?.id).toBe(roomA.id)
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: roomA.id, date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("voting in a private room publishes with private target", async () => {
    const room = createRoom("Team A")
    mockPublishVote.mockClear()
    toggleVote("mano")
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: room.id, date: "2026-03-25" },
      expect.any(Uint8Array),
      ["hash_mano"]
    )
  })

  it("renders room bar with current room name", () => {
    createRoom("Team A")
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("voting-room-bar")
    expect(html).toContain("voting-room-current")
    expect(html).toContain("Team A")
  })

  it("renders default room name when no room selected", () => {
    createRoom("Team A")
    switchToRoom(null)
    const html = getVotingCardHtml("Mittwoch")
    expect(html).toContain("Allgemein")
  })
})

describe("room persistence", () => {
  it("restores rooms from localStorage on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:rooms", JSON.stringify([
      { id: "test1234", name: "Saved Room", joinedAt: 1 },
    ]))
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(getKnownRooms()).toHaveLength(1)
    expect(getKnownRooms()[0].name).toBe("Saved Room")
  })

  it("restores active room from localStorage on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:rooms", JSON.stringify([
      { id: "test1234", name: "Saved Room", joinedAt: 1 },
    ]))
    localStorage.setItem("forkcast:activeRoom", "test1234")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(getActiveRoom()?.id).toBe("test1234")
    // Should subscribe to the private room, not default
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: "test1234", date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("falls back to default when saved active room is not in rooms list", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:rooms", JSON.stringify([]))
    localStorage.setItem("forkcast:activeRoom", "nonexistent")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(getActiveRoom()).toBeNull()
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-25" },
      expect.any(Function)
    )
  })

  it("handles corrupted rooms JSON gracefully", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:rooms", "not valid json{{{")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    expect(getKnownRooms()).toHaveLength(0)
    expect(isVotingActive()).toBe(true)
  })
})

describe("joinRoom", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    mockSubscribe.mockClear()
  })

  it("adds a new room and switches to it", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(getKnownRooms()).toHaveLength(1)
    expect(getActiveRoom()?.id).toBe("join1234")
  })

  it("is idempotent — joining the same room twice does not duplicate", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(getKnownRooms()).toHaveLength(1)
  })

  it("subscribes to the joined room", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: "join1234", date: "2026-03-25" },
      expect.any(Function)
    )
  })
})

describe("URL room parameter", () => {
  const originalLocation = window.location

  afterEach(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true })
  })

  function encodeRoomParam(id: string, name: string): string {
    return encodeRoomPayload({ id, name, joinedAt: 0 })
  }

  it("auto-joins room from URL parameter", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    const encoded = encodeRoomParam("url12345", "URL Room")
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: `?room=${encoded}`, href: `http://localhost?room=${encoded}`, pathname: "/" },
      writable: true,
    })
    window.history.replaceState = vi.fn()

    await initVoting(MOCK_RESTAURANTS)
    await flush()

    expect(getKnownRooms()).toHaveLength(1)
    expect(getKnownRooms()[0].name).toBe("URL Room")
    expect(getActiveRoom()?.id).toBe("url12345")
  })

  it("strips room parameter from URL after joining", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    const encoded = encodeRoomParam("url12345", "URL Room")
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: `?room=${encoded}`, href: `http://localhost?room=${encoded}`, pathname: "/" },
      writable: true,
    })
    const replaceStateSpy = vi.fn()
    window.history.replaceState = replaceStateSpy

    await initVoting(MOCK_RESTAURANTS)
    await flush()

    expect(replaceStateSpy).toHaveBeenCalledWith({}, "", "/")
  })

  it("ignores malformed room parameter", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "?room=not-valid-base64!!!", href: "http://localhost?room=not-valid-base64!!!", pathname: "/" },
      writable: true,
    })
    window.history.replaceState = vi.fn()

    await initVoting(MOCK_RESTAURANTS)
    await flush()

    expect(getKnownRooms()).toHaveLength(0)
    expect(getActiveRoom()).toBeNull()
    expect(isVotingActive()).toBe(true)
  })

  it("does not duplicate room when URL param matches existing room", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("forkcast:rooms", JSON.stringify([
      { id: "url12345", name: "URL Room", joinedAt: 1 },
    ]))
    const encoded = encodeRoomParam("url12345", "URL Room")
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: `?room=${encoded}`, href: `http://localhost?room=${encoded}`, pathname: "/" },
      writable: true,
    })
    window.history.replaceState = vi.fn()

    await initVoting(MOCK_RESTAURANTS)
    await flush()

    expect(getKnownRooms()).toHaveLength(1)
  })
})

describe("destroyVoting with rooms", () => {
  it("resets room state", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
    createRoom("Team A")
    expect(getActiveRoom()).not.toBeNull()
    expect(getKnownRooms()).toHaveLength(1)

    destroyVoting()
    expect(getActiveRoom()).toBeNull()
    expect(getKnownRooms()).toHaveLength(0)
  })
})

describe("room list panel state", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
  })

  it("starts closed", () => {
    expect(isRoomListOpen()).toBe(false)
  })

  it("can be opened and closed", () => {
    setRoomListOpen(true)
    expect(isRoomListOpen()).toBe(true)
    setRoomListOpen(false)
    expect(isRoomListOpen()).toBe(false)
  })

  it("opening resets confirm leave state", () => {
    setConfirmLeaveRoom("some-id")
    expect(getConfirmLeaveRoomId()).toBe("some-id")
    setRoomListOpen(true)
    expect(getConfirmLeaveRoomId()).toBeNull()
  })

  it("switchToRoom closes the list", () => {
    createRoom("Team A")
    setRoomListOpen(true)
    switchToRoom(null)
    expect(isRoomListOpen()).toBe(false)
  })

  it("createRoom closes the list", () => {
    setRoomListOpen(true)
    createRoom("Team A")
    expect(isRoomListOpen()).toBe(false)
  })

  it("leaveRoom resets confirm state", () => {
    const room = createRoom("Team A")
    setConfirmLeaveRoom(room.id)
    leaveRoom(room.id)
    expect(getConfirmLeaveRoomId()).toBeNull()
  })
})

describe("renameRoom", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(MOCK_RESTAURANTS)
    await flush()
  })

  it("renames a known room", () => {
    const room = createRoom("Old Name")
    renameRoom(room.id, "New Name")
    expect(getKnownRooms()[0].name).toBe("New Name")
  })

  it("updates activeRoom if it is the renamed room", () => {
    const room = createRoom("Old Name")
    renameRoom(room.id, "New Name")
    expect(getActiveRoom()?.name).toBe("New Name")
  })

  it("persists rename to localStorage", () => {
    const room = createRoom("Old Name")
    renameRoom(room.id, "New Name")
    const stored = JSON.parse(localStorage.getItem("forkcast:rooms") ?? "[]")
    expect(stored[0].name).toBe("New Name")
  })

  it("is a no-op for unknown room ID", () => {
    createRoom("Team A")
    renameRoom("nonexistent", "New Name")
    expect(getKnownRooms()[0].name).toBe("Team A")
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
