/* ── Relay connection management ──────────────────────────── */

import {
  subscribe,
  unsubscribe,
  obfuscateId,
  buildDTag,
} from "./nostr-client"
import {
  flushAllPublish,
  cancelPublish,
} from "./publish"
import type { VotingData, RoomTarget } from "./types"
import type { Restaurant } from "../types"

export interface ConnectionContext {
  getVotingData: () => VotingData | null
  getRestaurants: () => Restaurant[]
  getHashMap: () => Map<string, string>
  setHashEntry: (id: string, hashed: string) => void
  setActive: (v: boolean) => void
  buildAllRoomTargets: () => RoomTarget[]
  onRefreshVotingCards: (dTag: string) => void
  initUserVoteDates: () => void
  setDTagToDate: (map: Map<string, string>) => void
}

/* ── Module state ────────────────────────────────────────── */

let _ctx: ConnectionContext | null = null

/* ── Init ────────────────────────────────────────────────── */

export function initConnection(ctx: ConnectionContext): void {
  _ctx = ctx
}

/* ── Shared subscribe logic ──────────────────────────────── */

function buildDTagMapAndSubscribe(votingData: VotingData): void {
  if (!_ctx) return
  const dTagToDate = new Map<string, string>()
  const targets = _ctx.buildAllRoomTargets()
  for (const target of targets) {
    const dTag = buildDTag(votingData.appId, target)
    dTagToDate.set(dTag, target.date)
  }
  _ctx.setDTagToDate(dTagToDate)
  _ctx.initUserVoteDates()

  try {
    subscribe(votingData, targets, _ctx.onRefreshVotingCards)
  } catch (err) {
    console.warn("[voting] subscribe failed:", err)
  }
}

/* ── Connect & Subscribe ─────────────────────────────────── */

export async function connectAndSubscribe(): Promise<void> {
  if (!_ctx) return
  const votingData = _ctx.getVotingData()
  if (!votingData) return

  const restaurants = _ctx.getRestaurants()
  const hashEntries = await Promise.all(
    restaurants.map(async (r) => {
      const hashed = await obfuscateId(votingData.salt, r.id)
      return { id: r.id, hashed }
    })
  )
  for (const { id, hashed } of hashEntries) {
    _ctx.setHashEntry(id, hashed)
  }

  _ctx.setActive(true)
  buildDTagMapAndSubscribe(votingData)
}

/* ── Resubscribe (room switch) ───────────────────────────── */

export function resubscribe(): void {
  if (!_ctx) return
  const votingData = _ctx.getVotingData()
  if (!votingData) return
  buildDTagMapAndSubscribe(votingData)
}

/* ── Flush & Teardown ────────────────────────────────────── */

export function flushVotes(
  getHashedVotesForDate: (date: string) => string[],
  targets?: RoomTarget[],
): void {
  if (!_ctx) return
  const votingData = _ctx.getVotingData()
  if (!votingData) return
  const effectiveTargets = targets ?? _ctx.buildAllRoomTargets()
  flushAllPublish(votingData, effectiveTargets, (target) => () => getHashedVotesForDate(target.date))
}

export function flushAndTeardown(
  getHashedVotesForDate: (date: string) => string[],
  targets?: RoomTarget[],
): void {
  flushVotes(getHashedVotesForDate, targets)
  cancelPublish()
  unsubscribe()
}
