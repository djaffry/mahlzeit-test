/* ── Publish debouncing for vote events ──────────────────── */

import { getOrCreateIdentity } from "./user-identity"
import { publishVote } from "./nostr-client"
import type { VotingData, RoomTarget } from "./types"

const PUBLISH_DEBOUNCE_MS = 1000

let _publishTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
const _inFlight: Set<string> = new Set()

function targetKey(target: RoomTarget): string {
  return target.type === "default"
    ? `d:${target.date}`
    : `p:${target.roomId}:${target.date}`
}

async function doPublish(
  votingData: VotingData,
  target: RoomTarget,
  getHashedVotes: () => string[],
): Promise<void> {
  const key = targetKey(target)
  _inFlight.add(key)
  const identity = getOrCreateIdentity()
  try {
    await publishVote(votingData, target, identity.secretKey, getHashedVotes())
  } catch (err) {
    console.warn("[voting] publish failed:", err)
  } finally {
    _inFlight.delete(key)
  }
}

export function schedulePublish(
  votingData: VotingData,
  target: RoomTarget,
  getHashedVotes: () => string[],
): void {
  const key = targetKey(target)
  const existing = _publishTimers.get(key)
  if (existing) clearTimeout(existing)
  _publishTimers.set(key, setTimeout(async () => {
    _publishTimers.delete(key)
    await doPublish(votingData, target, getHashedVotes)
  }, PUBLISH_DEBOUNCE_MS))
}

function flushPublish(
  votingData: VotingData,
  target: RoomTarget,
  getHashedVotes: () => string[],
): void {
  const key = targetKey(target)
  const existing = _publishTimers.get(key)
  if (existing) {
    clearTimeout(existing)
    _publishTimers.delete(key)
    void doPublish(votingData, target, getHashedVotes)
  }
}

export function flushAllPublish(
  votingData: VotingData,
  targets: RoomTarget[],
  getHashedVotesForTarget: (target: RoomTarget) => () => string[],
): void {
  for (const target of targets) {
    flushPublish(votingData, target, getHashedVotesForTarget(target))
  }
}

export function cancelPublish(): void {
  for (const timer of _publishTimers.values()) clearTimeout(timer)
  _publishTimers = new Map()
}

export function isPublishPendingForDate(target: RoomTarget): boolean {
  const key = targetKey(target)
  return _publishTimers.has(key) || _inFlight.has(key)
}
