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

interface CreateVoteParams {
  appId: string
  target: RoomTarget
  votedIds: string[]
}

export function buildDTag(appId: string, target: RoomTarget): string {
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
    if (!content.votes.every((v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))) return null
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
let _votes: Map<string, Map<string, UserVote>> = new Map()
let _onUpdate: ((dTag: string) => void) | null = null
let _relayUrls: string[] = []
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _dirtyTags: Set<string> = new Set()
let _generation = 0

const EVENT_DEBOUNCE_MS = 16 // ~one frame, coalesces burst of relay events

export function getVotes(): ReadonlyMap<string, ReadonlyMap<string, UserVote>> {
  return _votes
}

function scheduleUpdate(dTag: string): void {
  _dirtyTags.add(dTag)
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    const tags = _dirtyTags
    _dirtyTags = new Set()
    for (const tag of tags) _onUpdate?.(tag)
  }, EVENT_DEBOUNCE_MS)
}

function validateRelayUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === "wss:"
    } catch {
      console.warn("[voting] skipping invalid relay URL:", url)
      return false
    }
  })
}

export function subscribe(
  votingData: VotingData,
  targets: RoomTarget[],
  onUpdate: (dTag: string) => void,
): void {
  _subscription?.close()
  _generation++
  const gen = _generation
  _onUpdate = onUpdate
  _votes = new Map()
  _relayUrls = validateRelayUrls(votingData.relays)

  if (!_pool) {
    _pool = new SimplePool()
  }

  const dTags = targets.map((t) => buildDTag(votingData.appId, t))
  for (const dTag of dTags) {
    _votes.set(dTag, new Map())
  }

  const since = Math.floor(Date.now() / 1000) - 6 * 86400

  if (_relayUrls.length === 0) {
    console.warn("[voting] no valid wss:// relay URLs, skipping subscription")
    return
  }

  _subscription = _pool.subscribeMany(
    _relayUrls,
    {
      kinds: [APP_STATE_KIND],
      "#d": dTags,
      since,
    },
    {
      onevent(event) {
        if (gen !== _generation) return
        const dTag = event.tags.find((t: string[]) => t[0] === "d")?.[1]
        if (!dTag) return
        const vote = parseVoteEvent(event)
        if (!vote) return

        const dayVotes = _votes.get(dTag)
        if (!dayVotes) return // relay sent a d-tag we didn't ask for

        const existing = dayVotes.get(vote.pubkey)
        if (existing && existing.createdAt >= vote.createdAt) return

        dayVotes.set(vote.pubkey, vote)
        scheduleUpdate(dTag)
      },
      oneose() {
        if (gen !== _generation) return
        if (_debounceTimer) clearTimeout(_debounceTimer)
        _debounceTimer = null
        _dirtyTags.clear()
        _onUpdate?.("")
      },
    },
  )
}

interface PublishResult {
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
  const results = await Promise.allSettled(_pool.publish(_relayUrls, event))
  let ok = 0
  let failed = 0
  for (const r of results) {
    if (r.status === "fulfilled") ok++
    else failed++
  }
  return { ok, failed }
}

export function unsubscribe(): void {
  _generation++
  _subscription?.close()
  _subscription = null
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = null
  _dirtyTags.clear()
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
