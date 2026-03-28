import { createHash } from "node:crypto"
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure"
import type { EventTemplate } from "nostr-tools/pure"

const APP_STATE_KIND = 30078

export interface Keypair {
  secretKey: Uint8Array
  pubkey: string
}

export function generateKeypair(): Keypair {
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  return { secretKey, pubkey }
}

/**
 * Hash a restaurant ID so that raw IDs don't appear in Nostr relay messages.
 *
 * **This is NOT a privacy mechanism.** The salt and full restaurant list are
 * public (shipped in voting.json / the UI). Anyone with that data can
 * reconstruct the mapping. The sole purpose is to make the relay content
 * opaque to casual observers so it doesn't obviously read as "lunch voting
 * for <restaurant>".
 */
export function obfuscateId(salt: string, restaurantId: string): string {
  return createHash("sha256")
    .update(salt + ":" + restaurantId)
    .digest("hex")
}

export interface CreateRoomEventParams {
  secretKey: Uint8Array
  appId: string
  date: string
  options: string[]
}

export function createRoomEvent(params: CreateRoomEventParams) {
  const { secretKey, appId, date, options } = params
  const template: EventTemplate = {
    kind: APP_STATE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", `${appId}/room/${date}`]],
    content: JSON.stringify({ options, date }),
  }
  return finalizeEvent(template, secretKey)
}
