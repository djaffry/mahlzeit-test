import { SimplePool } from "nostr-tools/pool"
import { finalizeEvent } from "nostr-tools/pure"
import type { EventTemplate } from "nostr-tools/pure"
import type { SubCloser } from "nostr-tools/pool"
import type { UserVote, VotingData, RoomTarget } from "./types"

const APP_STATE_KIND = 30078

/* ── Restaurant ID obfuscation (browser, uses SubtleCrypto) ──
 *
 * **This is NOT a privacy mechanism.** The salt and full restaurant list are
 * public (shipped in voting.json / the UI). Anyone with that data can
 * reconstruct the mapping. The sole purpose is to make the relay content
 * opaque to casual observers so it doesn't obviously read as "lunch voting
 * for <restaurant>".
 */

export async function obfuscateId(salt: string, restaurantId: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ":" + restaurantId)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/* ── Vote event creation ────────────────────────────────── */

export interface CreateVoteParams {
  appId: string
  target: RoomTarget
  votedIds: string[]
}

function buildDTag(appId: string, target: RoomTarget): string {
  return target.type === "default"
    ? `${appId}/vote/${target.date}`
    : `${appId}/pvote/${target.roomId}/${target.date}`
}

export function createVoteEvent(params: CreateVoteParams): EventTemplate {
  return {
    kind: APP_STATE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", buildDTag(params.appId, params.target)]],
    content: JSON.stringify({ votes: params.votedIds }),
  }
}

/* ── Vote event parsing ─────────────────────────────────── */

const MAX_VOTES_PER_EVENT = 200

export function parseVoteEvent(event: { pubkey: string; created_at: number; content: string }): UserVote | null {
  try {
    const content = JSON.parse(event.content)
    if (!Array.isArray(content.votes) || content.votes.length > MAX_VOTES_PER_EVENT) return null
    if (!content.votes.every((v: unknown) => typeof v === "string")) return null
    return {
      pubkey: event.pubkey,
      votes: content.votes,
      createdAt: event.created_at,
    }
  } catch {
    return null
  }
}

/* ── Relay connection manager ───────────────────────────── */

let _pool: SimplePool | null = null
let _subscription: SubCloser | null = null
let _votes: Map<string, UserVote> = new Map()
let _onUpdate: (() => void) | null = null
let _relayUrls: string[] = []
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

const EVENT_DEBOUNCE_MS = 16 // ~one frame, coalesces burst of relay events

export function getVotes(): ReadonlyMap<string, UserVote> {
  return _votes
}

function scheduleUpdate(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    _onUpdate?.()
  }, EVENT_DEBOUNCE_MS)
}

export function subscribe(
  votingData: VotingData,
  target: RoomTarget,
  onUpdate: () => void
): void {
  _subscription?.close()
  _onUpdate = onUpdate
  _votes = new Map()
  _relayUrls = votingData.relays

  if (!_pool) {
    _pool = new SimplePool()
  }

  const dTag = buildDTag(votingData.appId, target)
  const since = Math.floor(Date.now() / 1000) - 6 * 86400

  _subscription = _pool.subscribeMany(
    votingData.relays,
    {
      kinds: [APP_STATE_KIND],
      "#d": [dTag],
      since,
    },
    {
      onevent(event) {
        const vote = parseVoteEvent(event)
        if (!vote) return

        const existing = _votes.get(vote.pubkey)
        if (existing && existing.createdAt >= vote.createdAt) return

        _votes.set(vote.pubkey, vote)
        scheduleUpdate()
      },
      oneose() {
        // End of stored events, flush immediately
        if (_debounceTimer) clearTimeout(_debounceTimer)
        _debounceTimer = null
        _onUpdate?.()
      },
    }
  )
}

export interface PublishResult {
  ok: number
  failed: number
}

export async function publishVote(
  votingData: VotingData,
  target: RoomTarget,
  secretKey: Uint8Array,
  votedIds: string[]
): Promise<PublishResult> {
  if (!_pool) return { ok: 0, failed: 0 }

  const template = createVoteEvent({
    appId: votingData.appId,
    target,
    votedIds,
  })

  const event = finalizeEvent(template, secretKey)
  const results = await Promise.allSettled(_pool.publish(votingData.relays, event))
  let ok = 0
  let failed = 0
  for (const r of results) {
    if (r.status === "fulfilled") ok++
    else failed++
  }
  return { ok, failed }
}

export function unsubscribe(): void {
  _subscription?.close()
  _subscription = null
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = null
  _votes = new Map()
  _onUpdate = null
}

export function destroy(): void {
  unsubscribe()
  if (_pool && _relayUrls.length) {
    _pool.close(_relayUrls)
  }
  _pool = null
  _relayUrls = []
}

export function getRelayStatus(): Map<string, boolean> {
  if (!_pool) return new Map()
  return _pool.listConnectionStatus()
}
