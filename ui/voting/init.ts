/* ── Voting lifecycle: wires voting card, Nostr client, and user identity ── */

import { config } from "../config"
import { getWeekDates, dateToIso } from "../utils/date"
import { todayIso } from "../utils/today"
import { getIdentity } from "./user-identity"
import { avatarSvg } from "./avatars"
import {
  destroy as destroyNostrClient,
  buildDTag,
} from "./nostr-client"
import {
  loadRooms,
  getActiveRoom,
  getKnownRooms,
  findRoomById,
  setActiveRoomDirect,
  addRoom,
  removeRoom,
  createRoom as createRoomData,
  renameRoom,
  encodeRoomPayload,
  decodeRoomPayload,
  resetRooms,
} from "./rooms"
import {
  schedulePublish,
  cancelPublish,
} from "./publish"
import {
  initVoteState,
  resetVoteState,
  initDates,
  syncUserVotesFromRelay,
  buildRows,
  getHashedVotesForDate,
  toggleVote as voteStateToggleVote,
  toggleAllVotes as voteStateToggleAllVotes,
} from "./vote-state"
import {
  initConnection,
  connectAndSubscribe,
  resubscribe,
  flushVotes,
  flushAndTeardown,
} from "./connection"
import type { VotingData, RoomTarget, PrivateRoom, VoteMapEntry, RoomBanner } from "./types"
import type { Restaurant } from "../types"

/* ── Re-exports for consumers ────────────────────────────── */

export { getActiveRoom, getKnownRooms, encodeRoomPayload, renameRoom } from "./rooms"

const CONSENT_KEY = "peckish:votingOptIn"

/* ── One-time migration from old "forkcast:" prefix ──────── */

const MIGRATED_KEY = "peckish:migrated"
const LEGACY_KEYS: [string, string][] = [
  ["forkcast:votingOptIn", "peckish:votingOptIn"],
  ["forkcast:rooms",       "peckish:rooms"],
  ["forkcast:activeRoom",  "peckish:activeRoom"],
  ["forkcast:voterKey",    "peckish:voterKey"],
]

function migrateLegacyKeys(): void {
  if (localStorage.getItem(MIGRATED_KEY)) return
  for (const [oldKey, newKey] of LEGACY_KEYS) {
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
    }
    localStorage.removeItem(oldKey)
  }
  localStorage.setItem(MIGRATED_KEY, "1")
}

/* ── Module state ────────────────────────────────────────── */

let _votingData: VotingData | null = null
let _getRestaurants: () => Restaurant[] = () => []
let _active = false
let _joinResult: RoomBanner | null = null

/** External callback notified whenever vote state changes */
let _onVoteChange: ((changedDate: string | null) => void) | null = null

let _hashMap: Map<string, string> = new Map()
let _reverseHashMap: Map<string, string> = new Map()

/** Ordered date strings from voting.json rooms (Mon-Fri) */
let _dates: string[] = []

/** Maps d-tags to date strings for routing relay updates */
let _dTagToDate: Map<string, string> = new Map()

/* ── Helpers ─────────────────────────────────────────────── */

function buildRoomTarget(date: string): RoomTarget {
  const activeRoom = getActiveRoom()
  if (activeRoom) {
    return { type: "private", roomId: activeRoom.id, date }
  }
  return { type: "default", date }
}

function buildAllRoomTargets(): RoomTarget[] {
  return _dates.map((date) => buildRoomTarget(date))
}

/* ── Wire sub-modules ────────────────────────────────────── */

function wireModules(): void {
  initVoteState({
    getVotingData: () => _votingData,
    isActive: () => _active,
    getRestaurants: () => _getRestaurants(),
    getDates: () => _dates,
    getHashMap: () => _hashMap,
    getReverseHashMap: () => _reverseHashMap,
    buildRoomTarget,
  })

  initConnection({
    getVotingData: () => _votingData,
    getRestaurants: () => _getRestaurants(),
    getHashMap: () => _hashMap,
    setHashEntry: (id, hashed) => {
      _hashMap.set(id, hashed)
      _reverseHashMap.set(hashed, id)
    },
    setActive: (v) => { _active = v },
    buildAllRoomTargets,
    onRefreshVotingCards: refreshVotingCards,
    initUserVoteDates: () => initDates(_dates),
    setDTagToDate: (map) => { _dTagToDate = map },
  })
}

/* ── DOM refresh ─────────────────────────────────────────── */

function refreshVotingCards(dTag: string): void {
  let changedDate: string | null = null
  if (dTag) {
    changedDate = _dTagToDate.get(dTag) ?? null
    if (changedDate) syncUserVotesFromRelay(changedDate)
  } else {
    // Empty dTag = oneose (initial load), sync all dates
    for (const date of _dates) syncUserVotesFromRelay(date)
  }
  _onVoteChange?.(changedDate)
}

/* ── Public API ───────────────────────────────────────────── */

export async function initVoting(getRestaurants: () => Restaurant[]): Promise<void> {
  _getRestaurants = getRestaurants
  _active = false
  _votingData = null
  _hashMap = new Map()
  _reverseHashMap = new Map()
  _dates = []
  resetVoteState()
  migrateLegacyKeys()
  loadRooms()
  handleRoomUrlParam()

  try {
    const resp = await fetch(`${config.dataPath}/voting.json`)
    if (!resp.ok) return
    _votingData = (await resp.json()) as VotingData
  } catch {
    return
  }

  // local date formatting — Vienna-local Monday must yield "2026-04-20", not its UTC eve.
  // todayIso() returns Vienna-local; _dates entries must compare-equal to it.
  _dates = getWeekDates().map(dateToIso)

  wireModules()

  if (localStorage.getItem(CONSENT_KEY) === "true") {
    if (_joinResult) {
      // Await so callers see isVotingActive() = true for the room-joined flow
      await connectAndSubscribe().catch(() => {})
    } else {
      connectAndSubscribe().catch(() => {})
    }
  }
}

export async function acceptVoting(): Promise<void> {
  if (_active || !_votingData) return
  localStorage.setItem(CONSENT_KEY, "true")
  await connectAndSubscribe()
}

export function isVotingActive(): boolean {
  return _active
}

export function hasConsented(): boolean {
  return localStorage.getItem(CONSENT_KEY) === "true"
}

export function isInNonDefaultRoom(): boolean {
  return getActiveRoom() !== null
}

export function flushPendingVotes(): void {
  flushVotes(getHashedVotesForDate)
}

export function toggleVote(restaurantId: string, dayIndex: number): void {
  if (!_active || !_votingData) return
  voteStateToggleVote(restaurantId, dayIndex)

  const date = _dates[dayIndex]
  if (!date) return
  const target = buildRoomTarget(date)
  schedulePublish(_votingData, target, () => getHashedVotesForDate(date))
}

export function toggleAllVotes(dayIndex: number): void {
  if (!_active || !_votingData) return
  voteStateToggleAllVotes(dayIndex)

  const date = _dates[dayIndex]
  if (!date) return
  const target = buildRoomTarget(date)
  schedulePublish(_votingData, target, () => getHashedVotesForDate(date))
  _onVoteChange?.(null)
}

/* ── Private rooms ───────────────────────────────────────── */

export function getActiveRoomPayload(): string | null {
  const activeRoom = getActiveRoom()
  if (!activeRoom) return null
  return encodeRoomPayload(activeRoom)
}

function handleRoomUrlParam(): void {
  const params = new URLSearchParams(window.location.search)
  const roomParam = params.get("room")
  if (!roomParam) return

  const decoded = decodeRoomPayload(roomParam)
  if (!decoded) return

  const existing = findRoomById(decoded.id)
  if (existing) {
    _joinResult = { kind: "alreadyIn", name: existing.name }
    setActiveRoomDirect(existing)
  } else {
    joinRoom({ id: decoded.id, name: decoded.name, joinedAt: Date.now() })
    _joinResult = { kind: "joined", name: decoded.name }
  }

  const url = new URL(window.location.href)
  url.searchParams.delete("room")
  window.history.replaceState({}, "", url.pathname + url.search)
}

export function createRoom(name: string): PrivateRoom {
  const room = createRoomData(name)
  switchToRoom(room)
  return room
}

export function joinRoom(room: PrivateRoom): void {
  addRoom(room)
  if (_active && _votingData) {
    switchToRoom(room)
  } else {
    setActiveRoomDirect(room)
  }
}

export function switchToRoom(room: PrivateRoom | null): void {
  if (room?.id === getActiveRoom()?.id) return

  const oldTargets = buildAllRoomTargets()
  setActiveRoomDirect(room)

  if (_active && _votingData) {
    flushAndTeardown(getHashedVotesForDate, oldTargets)
    resetVoteState()
    resubscribe()
    _onVoteChange?.(null)
  }
}

export function leaveRoom(roomId: string): void {
  removeRoom(roomId)
  if (getActiveRoom()?.id === roomId) {
    switchToRoom(null)
  }
}

export function getJoinResult(): RoomBanner | null {
  return _joinResult
}

export function getRelayUrls(): readonly string[] {
  return _votingData?.relays ?? []
}

export function getVoteMap(dayIndex: number): Map<string, VoteMapEntry> {
  const date = _dates[dayIndex]
  if (!date) return new Map()
  const rows = buildRows(date)
  const identity = getIdentity()
  const myPubkey = identity?.pubkey ?? null
  const map = new Map<string, VoteMapEntry>()
  for (const row of rows) {
    const voters = row.voters.map((v) => {
      const isSelf = myPubkey !== null && v.pubkey === myPubkey
      return { color: v.avatar.color, label: v.avatar.label, iconSvg: avatarSvg(v.avatar, 10), isSelf }
    })
    map.set(row.id, { count: row.voteCount, userVoted: row.userVoted, voters })
  }
  return map
}

/** Register a callback invoked whenever vote state changes (relay update or local toggle). */
export function setOnVoteChange(callback: ((changedDate: string | null) => void) | null): void {
  _onVoteChange = callback
}

export function getTodayVoteDate(): string | null {
  const today = todayIso()
  return _dates.includes(today) ? today : null
}

export function destroyVoting(): void {
  cancelPublish()
  destroyNostrClient()
  _votingData = null
  _getRestaurants = () => []
  _active = false
  _hashMap = new Map()
  _reverseHashMap = new Map()
  _dates = []
  _dTagToDate = new Map()
  resetVoteState()
  resetRooms()
  _joinResult = null
}
