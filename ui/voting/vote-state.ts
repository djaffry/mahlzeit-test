/* ── Vote tracking & row building ──────────────────────────── */

import { getOrCreateIdentity } from "./user-identity"
import { getAvatar } from "./avatars"
import { getVotes, buildDTag } from "./nostr-client"
import { isPublishPendingForDate } from "./publish"
import type { VotingData, RoomTarget, Avatar } from "./types"
import type { Restaurant } from "../types"

export interface VoterInfo {
  pubkey: string
  avatar: Avatar
}

export interface RestaurantVoteRow {
  id: string
  name: string
  voteCount: number
  voters: VoterInfo[]
  userVoted: boolean
}

export interface VoteStateContext {
  getVotingData: () => VotingData | null
  isActive: () => boolean
  getRestaurants: () => Restaurant[]
  getDates: () => string[]
  getHashMap: () => Map<string, string>
  getReverseHashMap: () => Map<string, string>
  buildRoomTarget: (date: string) => RoomTarget
}

/* ── Module state ────────────────────────────────────────── */

let _ctx: VoteStateContext | null = null

/** Per-date set of restaurant IDs the user has voted for */
let _userVotedByDate: Map<string, Set<string>> = new Map()

let _localVoteTouched: Map<string, number> = new Map()
const LOCAL_VOTE_STALENESS_MS = 3000

/* ── Init / Reset ────────────────────────────────────────── */

export function initVoteState(ctx: VoteStateContext): void {
  _ctx = ctx
}

export function resetVoteState(): void {
  _userVotedByDate = new Map()
  _localVoteTouched = new Map()
}

/* ── Date initialization ─────────────────────────────────── */

export function initDates(dates: string[]): void {
  for (const date of dates) {
    if (!_userVotedByDate.has(date)) {
      _userVotedByDate.set(date, new Set())
    }
  }
}

/* ── Hashed votes for a date ─────────────────────────────── */

export function getHashedVotesForDate(date: string): string[] {
  if (!_ctx) return []
  const voted = _userVotedByDate.get(date) ?? new Set()
  const hashMap = _ctx.getHashMap()
  return [...voted]
    .map((id) => hashMap.get(id))
    .filter((h): h is string => h !== undefined)
}

/* ── Sync from relay ─────────────────────────────────────── */

export function syncUserVotesFromRelay(date: string): void {
  if (!_ctx) return
  const votingData = _ctx.getVotingData()
  if (!votingData) return
  const target = _ctx.buildRoomTarget(date)
  const dTag = buildDTag(votingData.appId, target)
  if (isPublishPendingForDate(target)) return

  const touchedAt = _localVoteTouched.get(date)
  if (touchedAt && (Date.now() - touchedAt) < LOCAL_VOTE_STALENESS_MS) return

  const allVotes = getVotes()
  const dayVotes = allVotes.get(dTag)
  if (!dayVotes) return

  const identity = getOrCreateIdentity()
  const myVote = dayVotes.get(identity.pubkey)
  if (!myVote) return

  const reverseHashMap = _ctx.getReverseHashMap()
  const newSet = new Set<string>()
  for (const hashedId of myVote.votes) {
    const restaurantId = reverseHashMap.get(hashedId)
    if (restaurantId) newSet.add(restaurantId)
  }
  _userVotedByDate.set(date, newSet)
}

/* ── Build vote rows for a date ──────────────────────────── */

export function buildRows(date: string): RestaurantVoteRow[] {
  if (!_ctx) return []
  const votingData = _ctx.getVotingData()
  if (!votingData) return []
  const restaurants = _ctx.getRestaurants()
  const hashMap = _ctx.getHashMap()
  const dTag = buildDTag(votingData.appId, _ctx.buildRoomTarget(date))
  const allVotes = getVotes()
  const dayVotes = allVotes.get(dTag) ?? new Map()
  const identity = getOrCreateIdentity()
  const myPubkey = identity.pubkey
  const myAvatar: VoterInfo = { pubkey: myPubkey, avatar: identity.avatar }
  const userVoted = _userVotedByDate.get(date) ?? new Set()

  const restaurantHashes: { r: Restaurant; hid: string | undefined }[] = restaurants.map((r) => ({
    r,
    hid: hashMap.get(r.id),
  }))

  const tally: Map<string, VoterInfo[]> = new Map()
  for (const { hid } of restaurantHashes) {
    if (hid) tally.set(hid, [])
  }

  for (const [, userVote] of dayVotes) {
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

  // Reconcile tally with optimistic local state before the relay echoes our vote back
  for (const { r, hid } of restaurantHashes) {
    if (!hid) continue
    const voters = tally.get(hid) ?? []
    const hasMe = voters.some((v) => v.pubkey === myPubkey)
    const shouldHaveMe = userVoted.has(r.id)

    if (shouldHaveMe && !hasMe) {
      voters.push(myAvatar)
    } else if (!shouldHaveMe && hasMe) {
      tally.set(hid, voters.filter((v) => v.pubkey !== myPubkey))
    }
  }

  return restaurantHashes.map(({ r, hid }) => {
    const voters = (hid ? tally.get(hid) : undefined) ?? []
    return {
      id: r.id,
      name: r.title,
      voteCount: voters.length,
      voters,
      userVoted: userVoted.has(r.id),
    }
  })
}

/* ── Toggle votes ────────────────────────────────────────── */

export function toggleVote(restaurantId: string, dayIndex: number): void {
  if (!_ctx) return
  if (!_ctx.isActive() || !_ctx.getVotingData()) return
  const dates = _ctx.getDates()
  const date = dates[dayIndex]
  if (!date) return

  let voted = _userVotedByDate.get(date)
  if (!voted) {
    voted = new Set()
    _userVotedByDate.set(date, voted)
  }

  if (voted.has(restaurantId)) {
    voted.delete(restaurantId)
  } else {
    voted.add(restaurantId)
  }

  _localVoteTouched.set(date, Date.now())
}

export function toggleAllVotes(dayIndex: number): void {
  if (!_ctx) return
  if (!_ctx.isActive() || !_ctx.getVotingData()) return
  const dates = _ctx.getDates()
  const date = dates[dayIndex]
  if (!date) return

  const restaurants = _ctx.getRestaurants()
  const allIds = restaurants.map((r) => r.id)
  const current = _userVotedByDate.get(date) ?? new Set()
  const allSelected = allIds.every((id) => current.has(id))

  _userVotedByDate.set(date, allSelected ? new Set() : new Set(allIds))

  _localVoteTouched.set(date, Date.now())
}
