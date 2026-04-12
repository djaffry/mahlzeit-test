import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { UserVote, VotingData } from "./types"
import type { Restaurant } from "../types"

/* ── Mock nostr-client (no real Nostr network) ───────────── */

let mockVotes: Map<string, Map<string, UserVote>> = new Map()
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
  buildDTag: (appId: string, target: { type: string; date: string; roomId?: string }) =>
    target.type === "default"
      ? `${appId}/vote/${target.date}`
      : `${appId}/pvote/${target.roomId}/${target.date}`,
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
  todayDayIndex: () => 2, // Wednesday = index 2
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
  getVoteMap,
  destroyVoting,
  createRoom,
  joinRoom,
  switchToRoom,
  leaveRoom,
  getActiveRoom,
  getKnownRooms,
  encodeRoomPayload,
  renameRoom,
} from "./init"

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

function setMockVotes(dTag: string, pubkey: string, votes: string[]): void {
  let dayVotes = mockVotes.get(dTag)
  if (!dayVotes) {
    dayVotes = new Map()
    mockVotes.set(dTag, dayVotes)
  }
  dayVotes.set(pubkey, { pubkey, votes, createdAt: Math.floor(Date.now() / 1000) })
}

/* ── Tests ───────────────────────────────────────────────── */

beforeEach(() => {
  mockVotes = new Map()
  mockPublishVote.mockClear()
  mockSubscribe.mockClear()
  mockUnsubscribe.mockClear()
  mockDestroy.mockClear()
  setupFetch()
  localStorage.setItem("peckish:votingOptIn", "true")
  localStorage.setItem("peckish:migrated", "1")
  localStorage.removeItem("peckish:rooms")
  localStorage.removeItem("peckish:activeRoom")
  document.body.innerHTML = ""
})

afterEach(() => {
  destroyVoting()
  vi.useRealTimers()
})

describe("initVoting", () => {
  it("activates when today is within the voting week", async () => {
    fakeNow("2026-03-25T12:00:00Z") // Wednesday
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
  })

  it("activates on weekends", async () => {
    fakeNow("2026-03-28T12:00:00Z") // Saturday
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
  })

  it("subscribes to all 5 dates on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(mockSubscribe).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      [
        { type: "default", date: "2026-03-23" },
        { type: "default", date: "2026-03-24" },
        { type: "default", date: "2026-03-25" },
        { type: "default", date: "2026-03-26" },
        { type: "default", date: "2026-03-27" },
      ],
      expect.any(Function)
    )
  })

  it("does not activate when fetch fails", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"))
    await initVoting(() => MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
  })

  it("does not activate when response is not ok", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
    await initVoting(() => MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
  })

  it("includes link restaurants in voting options", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    const map = getVoteMap(2)
    expect(map.has("dean")).toBe(true)
  })
})

describe("toggleVote", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
  })

  it("marks a restaurant as voted", () => {
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.userVoted).toBe(true)
  })

  it("untoggles a previously voted restaurant", () => {
    toggleVote("mano", 2)
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.userVoted).toBe(false)
  })

  it("debounces publish (does not publish immediately)", () => {
    toggleVote("mano", 2)
    expect(mockPublishVote).not.toHaveBeenCalled()
  })

  it("publishes after debounce period", async () => {
    toggleVote("mano", 2)
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
    toggleVote("mano", 2)
    toggleVote("baobar", 2)
    toggleVote("dean", 2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toContain("hash_mano")
    expect(hashedIds).toContain("hash_baobar")
    expect(hashedIds).toContain("hash_dean")
  })

  it("sends only final state after toggle-on then toggle-off", async () => {
    toggleVote("mano", 2)
    toggleVote("baobar", 2)
    toggleVote("mano", 2) // undo mano
    await vi.advanceTimersByTimeAsync(1100)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toEqual(["hash_baobar"])
  })

  it("includes user in vote count optimistically", () => {
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.count).toBe(1)
    expect(map.get("mano")?.userVoted).toBe(true)
  })

  it("vote on one day does not affect another", () => {
    toggleVote("mano", 2) // Wednesday
    const wedMap = getVoteMap(2)
    const monMap = getVoteMap(0)
    expect(wedMap.get("mano")?.userVoted).toBe(true)
    expect(monMap.get("mano")?.userVoted).toBe(false)
  })

  it("votes on different days publish independently", async () => {
    toggleVote("mano", 0) // Monday
    toggleVote("baobar", 2) // Wednesday
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(2)
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-23" },
      expect.any(Uint8Array),
      ["hash_mano"]
    )
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "default", date: "2026-03-25" },
      expect.any(Uint8Array),
      ["hash_baobar"]
    )
  })
})

describe("publish failure handling", () => {
  it("publishes even when relays reject", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    mockPublishVote.mockRejectedValueOnce(new Error("relay error"))
    toggleVote("mano", 2)
    await vi.advanceTimersByTimeAsync(1100)

    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    // Vote state is preserved despite failure
    const map = getVoteMap(2)
    expect(map.get("mano")?.userVoted).toBe(true)
  })
})

describe("toggleAllVotes", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
  })

  it("selects all restaurants", () => {
    toggleAllVotes(2)
    const map = getVoteMap(2)
    expect([...map.values()].every((v) => v.userVoted)).toBe(true)
  })

  it("deselects all when all are already selected", () => {
    toggleAllVotes(2) // select all
    toggleAllVotes(2) // deselect all
    const map = getVoteMap(2)
    expect([...map.values()].every((v) => !v.userVoted)).toBe(true)
  })

  it("publishes all hashed IDs after debounce", async () => {
    toggleAllVotes(2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
    const hashedIds = mockPublishVote.mock.calls[0][3] as string[]
    expect(hashedIds).toHaveLength(3)
    expect(hashedIds).toContain("hash_mano")
    expect(hashedIds).toContain("hash_baobar")
    expect(hashedIds).toContain("hash_dean")
  })

  it("does not affect other days", () => {
    toggleAllVotes(2) // Wednesday
    const wedMap = getVoteMap(2)
    const monMap = getVoteMap(0)
    expect([...wedMap.values()].every((v) => v.userVoted)).toBe(true)
    expect([...monMap.values()].every((v) => !v.userVoted)).toBe(true)
  })
})

describe("getVoteMap", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
  })

  it("returns entries for all restaurants", () => {
    const map = getVoteMap(2)
    expect(map.size).toBe(3)
    expect(map.has("mano")).toBe(true)
    expect(map.has("baobar")).toBe(true)
    expect(map.has("dean")).toBe(true)
  })

  it("returns empty map when not active", () => {
    destroyVoting()
    const map = getVoteMap(2)
    expect(map.size).toBe(0)
  })

  it("reflects external votes in vote counts", () => {
    const pubkey1 = "a".repeat(64)
    const pubkey2 = "b".repeat(64)
    setMockVotes("test-app/vote/2026-03-25", pubkey1, ["hash_baobar"])
    setMockVotes("test-app/vote/2026-03-25", pubkey2, ["hash_baobar"])
    const map = getVoteMap(2)
    expect(map.get("baobar")?.count).toBe(2)
    expect(map.get("mano")?.count).toBe(0)
  })

  it("external votes on one day do not appear on another", () => {
    const pubkey1 = "a".repeat(64)
    setMockVotes("test-app/vote/2026-03-25", pubkey1, ["hash_baobar"])
    const wedMap = getVoteMap(2)
    const monMap = getVoteMap(0)
    expect(wedMap.get("baobar")?.count).toBe(1)
    expect(monMap.get("baobar")?.count).toBe(0)
  })
})

describe("optimistic reconciliation", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
  })

  it("adds user to voter count before relay echo", () => {
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.count).toBe(1)
    expect(map.get("mano")?.userVoted).toBe(true)
  })

  it("removes user from voter count on unvote before relay echo", () => {
    // Toggle on then off: reconciliation should remove user from tally
    toggleVote("mano", 2)
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.count).toBe(0)
    expect(map.get("mano")?.userVoted).toBe(false)
  })
})

describe("consent flow", () => {
  it("does not connect to relays without opt-in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("does not publish votes without opt-in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    toggleVote("mano", 2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).not.toHaveBeenCalled()
  })

  it("is not active when not opted in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)
  })

  it("connects after acceptVoting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    expect(isVotingActive()).toBe(false)

    await acceptVoting()
    expect(isVotingActive()).toBe(true)
    expect(mockSubscribe).toHaveBeenCalled()
  })

  it("persists opt-in to localStorage", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    await acceptVoting()
    expect(localStorage.getItem("peckish:votingOptIn")).toBe("true")
  })

  it("provides vote map after accepting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    await acceptVoting()
    const map = getVoteMap(2)
    expect(map.size).toBe(3)
    expect(map.has("mano")).toBe(true)
  })

  it("accepting twice is a no-op", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    await acceptVoting()
    mockSubscribe.mockClear()
    await acceptVoting()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("auto-connects when previously opted in", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)
    const map = getVoteMap(2)
    expect(map.size).toBe(3)
  })

  it("voting works after accepting", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    await initVoting(() => MOCK_RESTAURANTS)
    await acceptVoting()
    toggleVote("mano", 2)
    const map = getVoteMap(2)
    expect(map.get("mano")?.userVoted).toBe(true)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
  })
})

describe("legacy key migration", () => {
  it("migrates forkcast: keys to peckish: on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:votingOptIn")
    localStorage.removeItem("peckish:migrated")
    localStorage.setItem("forkcast:votingOptIn", "true")
    localStorage.setItem("forkcast:rooms", JSON.stringify([{ id: "old1", name: "Old Room", joinedAt: 1 }]))
    localStorage.setItem("forkcast:activeRoom", "old1")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    expect(localStorage.getItem("peckish:votingOptIn")).toBe("true")
    expect(localStorage.getItem("peckish:rooms")).toContain("Old Room")
    expect(localStorage.getItem("peckish:activeRoom")).toBe("old1")
    // Old keys should be removed
    expect(localStorage.getItem("forkcast:votingOptIn")).toBeNull()
    expect(localStorage.getItem("forkcast:rooms")).toBeNull()
    expect(localStorage.getItem("forkcast:activeRoom")).toBeNull()
  })

  it("does not overwrite existing peckish: keys", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.removeItem("peckish:migrated")
    localStorage.setItem("peckish:votingOptIn", "true")
    localStorage.setItem("forkcast:votingOptIn", "old-value")

    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    expect(localStorage.getItem("peckish:votingOptIn")).toBe("true")
  })

  it("only runs migration once", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:migrated", "1")
    localStorage.setItem("forkcast:votingOptIn", "true")
    localStorage.removeItem("peckish:votingOptIn")

    await initVoting(() => MOCK_RESTAURANTS)

    // Should NOT have been migrated because migrated flag was set
    expect(localStorage.getItem("peckish:votingOptIn")).toBeNull()
  })
})

describe("private rooms", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
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

  it("subscribes with private room targets after creating", () => {
    const room = createRoom("Team A")
    expect(mockSubscribe).toHaveBeenCalled()
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "private")).toBe(true)
    expect(targets.every((t: { roomId: string }) => t.roomId === room.id)).toBe(true)
  })

  it("unsubscribes from previous room when switching", () => {
    createRoom("Team A")
    mockUnsubscribe.mockClear()
    createRoom("Team B")
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it("persists rooms to localStorage", () => {
    createRoom("Team A")
    const stored = JSON.parse(localStorage.getItem("peckish:rooms") ?? "[]")
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe("Team A")
  })

  it("persists active room ID to localStorage", () => {
    const room = createRoom("Team A")
    expect(localStorage.getItem("peckish:activeRoom")).toBe(room.id)
  })

  it("removes active room key when switching to default", () => {
    createRoom("Team A")
    switchToRoom(null)
    expect(localStorage.getItem("peckish:activeRoom")).toBeNull()
  })

  it("switches back to default room", () => {
    createRoom("Team A")
    mockSubscribe.mockClear()
    switchToRoom(null)
    expect(getActiveRoom()).toBeNull()
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "default")).toBe(true)
  })

  it("flushes pending votes when switching rooms", async () => {
    toggleVote("mano", 2)
    createRoom("Team A") // should flush pending
    expect(mockPublishVote).toHaveBeenCalledTimes(1)
  })

  it("flushes votes to the OLD room target before switching", async () => {
    toggleVote("mano", 2)
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
    toggleVote("mano", 2)
    createRoom("Team A")
    const map = getVoteMap(2)
    expect([...map.values()].every((v) => !v.userVoted)).toBe(true)
  })

  it("leaves a room and returns to default", () => {
    const room = createRoom("Team A")
    mockSubscribe.mockClear()
    leaveRoom(room.id)
    expect(getActiveRoom()).toBeNull()
    expect(getKnownRooms()).toHaveLength(0)
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "default")).toBe(true)
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
    const stored = JSON.parse(localStorage.getItem("peckish:rooms") ?? "[]")
    expect(stored).toHaveLength(0)
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
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "private")).toBe(true)
    expect(targets.every((t: { roomId: string }) => t.roomId === roomA.id)).toBe(true)
  })

  it("voting in a private room publishes with private target", async () => {
    const room = createRoom("Team A")
    mockPublishVote.mockClear()
    toggleVote("mano", 2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockPublishVote).toHaveBeenCalledWith(
      MOCK_VOTING_DATA,
      { type: "private", roomId: room.id, date: "2026-03-25" },
      expect.any(Uint8Array),
      ["hash_mano"]
    )
  })

})

describe("room persistence", () => {
  it("restores rooms from localStorage on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:rooms", JSON.stringify([
      { id: "test1234", name: "Saved Room", joinedAt: 1 },
    ]))
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(getKnownRooms()).toHaveLength(1)
    expect(getKnownRooms()[0].name).toBe("Saved Room")
  })

  it("restores active room from localStorage on init", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:rooms", JSON.stringify([
      { id: "test1234", name: "Saved Room", joinedAt: 1 },
    ]))
    localStorage.setItem("peckish:activeRoom", "test1234")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(getActiveRoom()?.id).toBe("test1234")
    // Should subscribe to the private room, not default
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "private")).toBe(true)
    expect(targets.every((t: { roomId: string }) => t.roomId === "test1234")).toBe(true)
  })

  it("falls back to default when saved active room is not in rooms list", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:rooms", JSON.stringify([]))
    localStorage.setItem("peckish:activeRoom", "nonexistent")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(getActiveRoom()).toBeNull()
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "default")).toBe(true)
  })

  it("handles corrupted rooms JSON gracefully", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:rooms", "not valid json{{{")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(getKnownRooms()).toHaveLength(0)
    expect(isVotingActive()).toBe(true)
  })
})

describe("joinRoom", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    mockSubscribe.mockClear()
  })

  it("adds a new room and switches to it", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(getKnownRooms()).toHaveLength(1)
    expect(getActiveRoom()?.id).toBe("join1234")
  })

  it("is idempotent - joining the same room twice does not duplicate", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(getKnownRooms()).toHaveLength(1)
  })

  it("subscribes to the joined room", () => {
    joinRoom({ id: "join1234", name: "Joined Room", joinedAt: Date.now() })
    expect(mockSubscribe).toHaveBeenCalled()
    const targets = mockSubscribe.mock.calls[0][1]
    expect(targets).toHaveLength(5)
    expect(targets.every((t: { type: string }) => t.type === "private")).toBe(true)
    expect(targets.every((t: { roomId: string }) => t.roomId === "join1234")).toBe(true)
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

    await initVoting(() => MOCK_RESTAURANTS)
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

    await initVoting(() => MOCK_RESTAURANTS)
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

    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    expect(getKnownRooms()).toHaveLength(0)
    expect(getActiveRoom()).toBeNull()
    expect(isVotingActive()).toBe(true)
  })

  it("does not duplicate room when URL param matches existing room", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    localStorage.setItem("peckish:rooms", JSON.stringify([
      { id: "url12345", name: "URL Room", joinedAt: 1 },
    ]))
    const encoded = encodeRoomParam("url12345", "URL Room")
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: `?room=${encoded}`, href: `http://localhost?room=${encoded}`, pathname: "/" },
      writable: true,
    })
    window.history.replaceState = vi.fn()

    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    expect(getKnownRooms()).toHaveLength(1)
  })
})

describe("destroyVoting with rooms", () => {
  it("resets room state", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    createRoom("Team A")
    expect(getActiveRoom()).not.toBeNull()
    expect(getKnownRooms()).toHaveLength(1)

    destroyVoting()
    expect(getActiveRoom()).toBeNull()
    expect(getKnownRooms()).toHaveLength(0)
  })
})

describe("renameRoom", () => {
  beforeEach(async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
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
    const stored = JSON.parse(localStorage.getItem("peckish:rooms") ?? "[]")
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
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()
    expect(isVotingActive()).toBe(true)

    destroyVoting()
    expect(isVotingActive()).toBe(false)
    expect(getVoteMap(2).size).toBe(0)
  })
})

describe("syncUserVotesFromRelay staleness guard", () => {
  it("does not overwrite local votes within the staleness window", async () => {
    fakeNow("2026-03-25T12:00:00Z")
    await initVoting(() => MOCK_RESTAURANTS)
    await flush()

    // User toggles a vote locally
    toggleVote("mano", 2)

    // Simulate relay echoing back an empty vote list for the same date
    const identity = (await import("./user-identity")).getOrCreateIdentity()
    setMockVotes("test-app/vote/2026-03-25", identity.pubkey, [])

    // Trigger relay sync
    const subscribeCb = mockSubscribe.mock.calls[0]?.[2]
    if (subscribeCb) subscribeCb("test-app/vote/2026-03-25")

    // Local vote should be preserved
    const voteMap = getVoteMap(2)
    expect(voteMap.get("mano")?.userVoted).toBe(true)
  })
})
