/* ── Voting lifecycle: wires voting card, Nostr client, and user identity ── */

import { config } from "../config"
import { DAYS } from "../constants"
import { getTodayName } from "../utils/date"
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
import type { VotingData } from "./types"
import type { Restaurant } from "../types"

const CONSENT_KEY = "forkcast:votingOptIn"
const COLLAPSED_KEY = "forkcast:votingCollapsed"

/* ── Module state ────────────────────────────────────────── */

let _votingData: VotingData | null = null
let _restaurants: Restaurant[] = []
let _active = false
let _consented = false
let _currentDate: string | null = null

/** Votes use hashed IDs so relay content doesn't visibly reference restaurant names (not a privacy guarantee — see nostr-client.ts) */
let _hashMap: Map<string, string> = new Map()
let _reverseHashMap: Map<string, string> = new Map()

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
  const votedHashedIds = [..._userVotedIds]
    .map((id) => _hashMap.get(id))
    .filter((h): h is string => h !== undefined)
  const identity = getOrCreateIdentity()
  const result = await publishVote(_votingData, _currentDate, identity.secretKey, votedHashedIds)
  if (result.ok > 0) {
    markSent()
  } else {
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

  _userVotedIds = new Set()
  for (const hashedId of myVote.votes) {
    const restaurantId = _reverseHashMap.get(hashedId)
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
      const html = renderCardForDate(_currentDate)
      const temp = document.createElement("div")
      temp.innerHTML = html
      const newCard = temp.firstElementChild
      if (newCard) {
        existingCard.replaceWith(newCard)
      }
    }
  }
  updateRowIndicators()
}

function refreshVotingCards(): void {
  syncUserVotesFromRelay()
  rerenderVotingCard()
}

function refreshVotingCardsOptimistic(): void {
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
    _reverseHashMap.set(hashed, id)
  }

  _active = true

  replaceConsentWithVotingCards()

  // Subscribe to today's room, or Friday's on weekends
  const ti = todayIndex()
  const subIndex = ti >= 0 ? ti : _dates.length - 1
  const date = dateForDayIndex(subIndex)
  if (date) {
    _currentDate = date
    subscribe(_votingData, date, refreshVotingCards)
  }
}

export async function initVoting(restaurants: Restaurant[]): Promise<void> {
  _restaurants = restaurants
  _active = false
  _consented = localStorage.getItem(CONSENT_KEY) === "true"
  _votingData = null
  _hashMap = new Map()
  _reverseHashMap = new Map()
  _dates = []
  _userVotedIds = new Set()
  _collapsed = localStorage.getItem(COLLAPSED_KEY) === "true"

  try {
    const resp = await fetch(`${config.dataPath}/voting.json`)
    if (!resp.ok) return
    _votingData = (await resp.json()) as VotingData
  } catch {
    return
  }

  const roomDates = Object.keys(_votingData.rooms).sort()
  if (roomDates.length === 0) return
  _dates = roomDates

  // If already opted in, connect in the background (don't block rendering)
  if (_consented) {
    connectAndSubscribe()
  }
}

export async function acceptVoting(): Promise<void> {
  if (_consented || !_votingData) return
  _consented = true
  localStorage.setItem(CONSENT_KEY, "true")
  await connectAndSubscribe()
}

export function isVotingActive(): boolean {
  return _active
}

export function onDayChangeVoting(dayIndex: number): void {
  if (!_active || !_votingData) return

  const date = dateForDayIndex(dayIndex)
  if (!date) return

  // Flush pending vote before switching days
  if (_publishTimer) {
    clearTimeout(_publishTimer)
    _publishTimer = null
    void doPublish()
  }

  _pendingIds = new Set()
  _sentIds = new Set()
  _failedIds = new Set()
  if (_sentTimer) { clearTimeout(_sentTimer); _sentTimer = null }
  unsubscribe()

  _currentDate = date
  _userVotedIds = new Set()

  // Subscribe to new day
  subscribe(_votingData, date, refreshVotingCards)
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
  refreshVotingCardsOptimistic()
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
  refreshVotingCardsOptimistic()
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
  if (!_consented) {
    const identity = getOrCreateIdentity()
    return renderConsentCard({
      userAvatar: identity.avatar,
      relayUrls: _votingData.relays,
    })
  }

  return ""
}

export function destroyVoting(): void {
  if (_publishTimer) clearTimeout(_publishTimer)
  _publishTimer = null
  if (_sentTimer) clearTimeout(_sentTimer)
  _sentTimer = null
  _pendingIds = new Set()
  _sentIds = new Set()
  _failedIds = new Set()
  destroyNostrClient()
  _votingData = null
  _restaurants = []
  _active = false
  _currentDate = null
  _hashMap = new Map()
  _reverseHashMap = new Map()
  _dates = []
  _userVotedIds = new Set()
}
