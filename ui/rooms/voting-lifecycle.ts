/* ── Voting lifecycle: wires voting card, Nostr client, and user identity ── */

import { config } from "../config"
import { DAYS } from "../constants"
import { getTodayName, getWeekDates } from "../utils/date"
import { getOrCreateIdentity } from "./user-identity"
import { getAvatar } from "./avatars"
import {
  subscribe,
  unsubscribe,
  destroy as destroyNostrClient,
  publishVote,
  getVotes,
  obfuscateId,
  getRelayStatus,
} from "./nostr-client"
import { renderVotingCard, renderConsentCard } from "./voting-card"
import type { RestaurantVoteRow, VoterInfo } from "./voting-card"
import type { VotingData, RoomTarget, PrivateRoom } from "./types"
import type { Restaurant } from "../types"

const CONSENT_KEY = "forkcast:votingOptIn"
const COLLAPSED_KEY = "forkcast:votingCollapsed"
const ROOMS_KEY = "forkcast:rooms"
const ACTIVE_ROOM_KEY = "forkcast:activeRoom"

/* ── Module state ────────────────────────────────────────── */

let _votingData: VotingData | null = null
let _restaurants: Restaurant[] = []
let _active = false
let _currentDate: string | null = null
let _activeRoom: PrivateRoom | null = null
let _knownRooms: PrivateRoom[] = []
let _roomListOpen = false
let _confirmLeaveRoomId: string | null = null
let _joinedViaUrl = false

let _hashMap: Map<string, string> = new Map()

/** Ordered date strings from voting.json rooms (Mon-Fri) */
let _dates: string[] = []

/** Set of restaurant IDs the user has voted for on the current day */
let _userVotedIds: Set<string> = new Set()

/** Cached collapsed state, updated by setVotingCollapsed() */
let _collapsed = false

/* ── Helpers ─────────────────────────────────────────────── */

function todayIndex(): number {
  const today = getTodayName()
  if (!today) return -1
  return DAYS.indexOf(today)
}

function dateForDayIndex(index: number): string | null {
  return _dates[index] ?? null
}

function dayIndexForDate(date: string): number {
  return _dates.indexOf(date)
}

function isReadOnly(dayIndex: number): boolean {
  const ti = todayIndex()
  if (ti === -1) return true // weekend, all days are read-only
  return dayIndex < ti
}

export function setVotingCollapsed(value: boolean): void {
  _collapsed = value
  localStorage.setItem(COLLAPSED_KEY, String(value))
}

/* ── Room helpers ────────────────────────────────────────── */

function loadRooms(): void {
  try {
    const raw = localStorage.getItem(ROOMS_KEY)
    _knownRooms = raw ? JSON.parse(raw) : []
  } catch {
    _knownRooms = []
  }
  const activeId = localStorage.getItem(ACTIVE_ROOM_KEY)
  _activeRoom = activeId ? _knownRooms.find((r) => r.id === activeId) ?? null : null
}

function saveRooms(): void {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(_knownRooms))
}

function saveActiveRoom(): void {
  if (_activeRoom) {
    localStorage.setItem(ACTIVE_ROOM_KEY, _activeRoom.id)
  } else {
    localStorage.removeItem(ACTIVE_ROOM_KEY)
  }
}

function buildRoomTarget(): RoomTarget | null {
  if (!_currentDate) return null
  if (_activeRoom) {
    return { type: "private", roomId: _activeRoom.id, date: _currentDate }
  }
  return { type: "default", date: _currentDate }
}

function generateRoomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
  const arr = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(arr, (b) => chars[b % chars.length]).join("")
}

const PUBLISH_DEBOUNCE_MS = 1000
const SENT_DISPLAY_MS = 2000
let _publishTimer: ReturnType<typeof setTimeout> | null = null
let _sentTimer: ReturnType<typeof setTimeout> | null = null

/** Restaurant IDs with unsent local changes */
let _pendingIds: Set<string> = new Set()
/** Restaurant IDs that were just confirmed sent */
let _sentIds: Set<string> = new Set()
/** Restaurant IDs whose publish failed (no relay accepted) */
let _failedIds: Set<string> = new Set()

function updateRowIndicators(): void {
  document.querySelectorAll<HTMLElement>(".voting-row").forEach((row) => {
    const id = row.dataset.restaurantId
    if (!id) return
    const indicator = row.querySelector(".voting-row-status")
    if (!indicator) return
    if (_pendingIds.has(id)) {
      indicator.className = "voting-row-status voting-status-pending"
    } else if (_failedIds.has(id)) {
      indicator.className = "voting-row-status voting-status-failed"
    } else if (_sentIds.has(id)) {
      indicator.className = "voting-row-status voting-status-sent"
    } else {
      indicator.className = "voting-row-status"
    }
  })
}

function markPending(ids: Iterable<string>): void {
  for (const id of ids) {
    _pendingIds.add(id)
    _sentIds.delete(id)
    _failedIds.delete(id)
  }
}

const FAILED_DISPLAY_MS = 4000

function markResult(target: Set<string>, displayMs: number): void {
  target.clear()
  for (const id of _pendingIds) target.add(id)
  _pendingIds.clear()
  updateRowIndicators()
  if (_sentTimer) clearTimeout(_sentTimer)
  _sentTimer = setTimeout(() => {
    _sentTimer = null
    target.clear()
    updateRowIndicators()
  }, displayMs)
}

function markSent(): void { markResult(_sentIds, SENT_DISPLAY_MS) }
function markFailed(): void { markResult(_failedIds, FAILED_DISPLAY_MS) }

async function doPublish(): Promise<void> {
  if (!_active || !_votingData || !_currentDate) return
  const target = buildRoomTarget()
  if (!target) return
  const dateAtPublish = _currentDate
  const roomAtPublish = _activeRoom?.id ?? null
  const votedHashedIds = [..._userVotedIds]
    .map((id) => _hashMap.get(id))
    .filter((h): h is string => h !== undefined)
  const identity = getOrCreateIdentity()
  const result = await publishVote(_votingData, target, identity.secretKey, votedHashedIds)
  // Context may have switched (day/room change) while publish was in-flight
  if (_currentDate !== dateAtPublish || (_activeRoom?.id ?? null) !== roomAtPublish) return
  if (result.ok > 0) {
    markSent()
  } else {
    rerenderVotingCard()
    markFailed()
  }
}

function schedulePublish(): void {
  if (_publishTimer) clearTimeout(_publishTimer)
  _publishTimer = setTimeout(async () => {
    _publishTimer = null
    await doPublish()
  }, PUBLISH_DEBOUNCE_MS)
}

/* ── Build vote rows for a date ──────────────────────────── */

function syncUserVotesFromRelay(): void {
  // Don't overwrite optimistic local state while a publish is pending
  if (_publishTimer) return

  const votes = getVotes()
  const identity = getOrCreateIdentity()
  const myVote = votes.get(identity.pubkey)
  if (!myVote) return

  const reverseMap = new Map<string, string>()
  for (const [id, hashed] of _hashMap) reverseMap.set(hashed, id)

  _userVotedIds = new Set()
  for (const hashedId of myVote.votes) {
    const restaurantId = reverseMap.get(hashedId)
    if (restaurantId) _userVotedIds.add(restaurantId)
  }
}

function buildRows(): RestaurantVoteRow[] {
  const votes = getVotes()
  const identity = getOrCreateIdentity()
  const myPubkey = identity.pubkey
  const myAvatar: VoterInfo = { pubkey: myPubkey, avatar: identity.avatar }

  const tally: Map<string, VoterInfo[]> = new Map()
  for (const r of _restaurants) {
    const hid = _hashMap.get(r.id)
    if (hid) tally.set(hid, [])
  }

  for (const [, userVote] of votes) {
    for (const hashedId of userVote.votes) {
      const voters = tally.get(hashedId)
      if (voters) {
        voters.push({
          pubkey: userVote.pubkey,
          avatar: getAvatar(userVote.pubkey),
        })
      }
    }
  }

  // Reconcile tally with optimistic local state so counts and sort are correct
  // before the relay echoes our vote back
  for (const r of _restaurants) {
    const hid = _hashMap.get(r.id)
    if (!hid) continue
    const voters = tally.get(hid) ?? []
    const hasMe = voters.some((v) => v.pubkey === myPubkey)
    const shouldHaveMe = _userVotedIds.has(r.id)

    if (shouldHaveMe && !hasMe) {
      voters.push(myAvatar)
    } else if (!shouldHaveMe && hasMe) {
      tally.set(hid, voters.filter((v) => v.pubkey !== myPubkey))
    }
  }

  return _restaurants.map((r) => {
    const hid = _hashMap.get(r.id) ?? ""
    const voters = tally.get(hid) ?? []
    return {
      id: r.id,
      name: r.title,
      voteCount: voters.length,
      voters,
      userVoted: _userVotedIds.has(r.id),
    }
  })
}

/* ── DOM refresh ─────────────────────────────────────────── */

function rerenderVotingCard(): void {
  if (!_active || !_currentDate) return

  const dayIndex = dayIndexForDate(_currentDate)
  if (dayIndex === -1) return
  const dayName = DAYS[dayIndex]

  const panels = document.querySelectorAll<HTMLElement>(`.day-panel[data-panel="${dayName}"]`)
  for (const panel of panels) {
    const existingCard = panel.querySelector(".voting-card")
    if (existingCard) {
      // Preserve content height when switching to the room list panel
      const contentInner = existingCard.querySelector<HTMLElement>(".restaurant-content-inner")
      const prevHeight = _roomListOpen ? (contentInner?.offsetHeight ?? 0) : 0

      const html = renderCardForDate(_currentDate)
      const temp = document.createElement("div")
      temp.innerHTML = html
      const newCard = temp.firstElementChild
      if (newCard) {
        if (prevHeight > 0) {
          const newInner = newCard.querySelector<HTMLElement>(".restaurant-content-inner")
          if (newInner) newInner.style.minHeight = `${prevHeight}px`
        }
        existingCard.replaceWith(newCard)
      }
    }
  }
}

function refreshVotingCards(): void {
  syncUserVotesFromRelay()
  rerenderVotingCard()
}


/* ── Render card HTML for a specific date ────────────────── */

function renderCardForDate(date: string): string {
  const dayIndex = dayIndexForDate(date)
  if (dayIndex === -1) return ""

  const identity = getOrCreateIdentity()
  const rows = buildRows()
  const past = isReadOnly(dayIndex)

  const relayStatus = getRelayStatus()
  return renderVotingCard({
    day: DAYS[dayIndex],
    userAvatar: identity.avatar,
    restaurants: rows,
    isReadOnly: past,
    relayStatus,
    collapsed: _collapsed,
    activeRoom: _activeRoom,
    knownRooms: _knownRooms,
    roomListOpen: _roomListOpen,
    confirmLeaveRoomId: _confirmLeaveRoomId,
    joinedViaUrl: _joinedViaUrl,
  })
}

/* ── Public API ───────────────────────────────────────────── */

function replaceConsentWithVotingCards(): void {
  document.querySelectorAll(".voting-consent").forEach((el) => el.remove())
  for (let i = 0; i < _dates.length; i++) {
    const dayName = DAYS[i]
    const html = renderCardForDate(_dates[i])
    if (!html) continue
    const panels = document.querySelectorAll<HTMLElement>(`.day-panel[data-panel="${dayName}"]`)
    for (const panel of panels) {
      const grid = panel.querySelector(".restaurant-grid")
      const mapCard = grid?.querySelector(".map-card")
      if (grid && mapCard && !panel.querySelector(".voting-card:not(.voting-consent)")) {
        mapCard.insertAdjacentHTML("afterend", html)
      }
    }
  }
}

async function connectAndSubscribe(): Promise<void> {
  if (!_votingData) return

  const hashEntries = await Promise.all(
    _restaurants.map(async (r) => {
      const hashed = await obfuscateId(_votingData!.salt, r.id)
      return { id: r.id, hashed }
    })
  )
  for (const { id, hashed } of hashEntries) {
    _hashMap.set(id, hashed)
  }

  _active = true

  replaceConsentWithVotingCards()

  // Subscribe to today's room, or Friday's on weekends
  const ti = todayIndex()
  const subIndex = ti >= 0 ? ti : _dates.length - 1
  const date = dateForDayIndex(subIndex)
  if (date) {
    _currentDate = date
    const target = buildRoomTarget()
    if (target) subscribe(_votingData, target, refreshVotingCards)
  }
}

export async function initVoting(restaurants: Restaurant[]): Promise<void> {
  _restaurants = restaurants
  _active = false
  _votingData = null
  _hashMap = new Map()
  _dates = []
  _userVotedIds = new Set()
  _collapsed = localStorage.getItem(COLLAPSED_KEY) === "true"
  loadRooms()
  handleRoomUrlParam()

  try {
    const resp = await fetch(`${config.dataPath}/voting.json`)
    if (!resp.ok) return
    _votingData = (await resp.json()) as VotingData
  } catch {
    return
  }

  _dates = getWeekDates().map((d) => d.toISOString().slice(0, 10))

  // If already opted in, connect in the background (don't block rendering)
  if (localStorage.getItem(CONSENT_KEY) === "true") {
    connectAndSubscribe().catch(() => {})
  }
}

export async function acceptVoting(): Promise<void> {
  if (localStorage.getItem(CONSENT_KEY) === "true" || !_votingData) return
  localStorage.setItem(CONSENT_KEY, "true")
  await connectAndSubscribe()
}

export function isVotingActive(): boolean {
  return _active
}

/** Flush pending publish, clear status indicators, unsubscribe */
function clearTimersAndIndicators(): void {
  if (_publishTimer) clearTimeout(_publishTimer)
  _publishTimer = null
  if (_sentTimer) clearTimeout(_sentTimer)
  _sentTimer = null
  _pendingIds = new Set()
  _sentIds = new Set()
  _failedIds = new Set()
}

function flushAndTeardown(): void {
  if (_publishTimer) void doPublish()
  clearTimersAndIndicators()
  unsubscribe()
  _userVotedIds = new Set()
}

function resubscribe(): void {
  if (!_votingData) return
  const target = buildRoomTarget()
  if (target) subscribe(_votingData, target, refreshVotingCards)
}

export function onDayChangeVoting(dayIndex: number): void {
  if (!_active || !_votingData) return

  const date = dateForDayIndex(dayIndex)
  if (!date) return

  flushAndTeardown()
  _currentDate = date
  resubscribe()
}

export function toggleVote(restaurantId: string): void {
  if (!_active || !_votingData || !_currentDate) return

  const dayIndex = dayIndexForDate(_currentDate)
  if (isReadOnly(dayIndex)) return

  if (_userVotedIds.has(restaurantId)) {
    _userVotedIds.delete(restaurantId)
  } else {
    _userVotedIds.add(restaurantId)
  }

  markPending([restaurantId])
  schedulePublish()
  rerenderVotingCard()
}

export function toggleAllVotes(): void {
  if (!_active || !_votingData || !_currentDate) return

  const dayIndex = dayIndexForDate(_currentDate)
  if (isReadOnly(dayIndex)) return

  const allIds = _restaurants.map((r) => r.id)
  const allSelected = allIds.every((id) => _userVotedIds.has(id))

  if (allSelected) {
    _userVotedIds = new Set()
  } else {
    _userVotedIds = new Set(allIds)
  }

  markPending(allIds)
  schedulePublish()
  rerenderVotingCard()
}

export function getVotingCardHtml(day: string): string {
  if (!_votingData) return ""

  const dayIndex = DAYS.indexOf(day as (typeof DAYS)[number])
  if (dayIndex === -1) return ""

  const date = dateForDayIndex(dayIndex)
  if (!date) return ""

  if (_active) return renderCardForDate(date)

  // Not yet active: show consent if user hasn't opted in,
  // otherwise empty (connectAndSubscribe will inject when ready)
  if (localStorage.getItem(CONSENT_KEY) !== "true") {
    const identity = getOrCreateIdentity()
    return renderConsentCard({
      userAvatar: identity.avatar,
      relayUrls: _votingData.relays,
      highlight: _joinedViaUrl,
    })
  }

  return ""
}

/* ── Private rooms ───────────────────────────────────────── */

export function encodeRoomPayload(room: PrivateRoom): string {
  return btoa(JSON.stringify({ id: room.id, name: room.name }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function decodeRoomPayload(encoded: string): { id: string; name: string } | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const { id, name } = JSON.parse(atob(padded))
    if (typeof id !== "string" || typeof name !== "string") return null
    return { id, name }
  } catch {
    return null
  }
}

function handleRoomUrlParam(): void {
  const params = new URLSearchParams(window.location.search)
  const roomParam = params.get("room")
  if (!roomParam) return

  const decoded = decodeRoomPayload(roomParam)
  if (!decoded) return

  joinRoom({ id: decoded.id, name: decoded.name, joinedAt: Date.now() })
  _joinedViaUrl = true

  const url = new URL(window.location.href)
  url.searchParams.delete("room")
  window.history.replaceState({}, "", url.pathname + url.search)
}

export function createRoom(name: string): PrivateRoom {
  const room: PrivateRoom = { id: generateRoomId(), name, joinedAt: Date.now() }
  _knownRooms.push(room)
  saveRooms()
  _roomListOpen = false
  switchToRoom(room)
  return room
}

export function joinRoom(room: PrivateRoom): void {
  if (!_knownRooms.some((r) => r.id === room.id)) {
    _knownRooms.push(room)
    saveRooms()
  }
  if (_active && _votingData) {
    switchToRoom(room)
  } else {
    _activeRoom = room
    saveActiveRoom()
  }
}

export function switchToRoom(room: PrivateRoom | null): void {
  if (!_active || !_votingData) return
  if (room?.id === _activeRoom?.id) return

  _roomListOpen = false
  _confirmLeaveRoomId = null
  flushAndTeardown()
  _activeRoom = room
  saveActiveRoom()
  resubscribe()
}

export function leaveRoom(roomId: string): void {
  _confirmLeaveRoomId = null
  _knownRooms = _knownRooms.filter((r) => r.id !== roomId)
  saveRooms()
  if (_activeRoom?.id === roomId) {
    switchToRoom(null)
  } else {
    rerenderVotingCard()
  }
}

export function getActiveRoom(): PrivateRoom | null {
  return _activeRoom
}

export function getKnownRooms(): readonly PrivateRoom[] {
  return _knownRooms
}

export function setRoomListOpen(open: boolean): void {
  _roomListOpen = open
  _confirmLeaveRoomId = null
  rerenderVotingCard()
}

export function isRoomListOpen(): boolean {
  return _roomListOpen
}

export function setConfirmLeaveRoom(roomId: string | null): void {
  _confirmLeaveRoomId = roomId
  rerenderVotingCard()
}

export function getConfirmLeaveRoomId(): string | null {
  return _confirmLeaveRoomId
}

export function isJoinedViaUrl(): boolean {
  return _joinedViaUrl
}

export function renameRoom(roomId: string, newName: string): void {
  const room = _knownRooms.find((r) => r.id === roomId)
  if (!room) return
  room.name = newName
  saveRooms()
  if (_activeRoom?.id === roomId) _activeRoom = room
  rerenderVotingCard()
}

export function destroyVoting(): void {
  clearTimersAndIndicators()
  destroyNostrClient()
  _votingData = null
  _restaurants = []
  _active = false
  _currentDate = null
  _hashMap = new Map()
  _dates = []
  _userVotedIds = new Set()
  _activeRoom = null
  _knownRooms = []
  _roomListOpen = false
  _confirmLeaveRoomId = null
  _joinedViaUrl = false
}
