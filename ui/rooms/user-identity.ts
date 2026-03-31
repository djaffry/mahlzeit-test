import { generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { getAvatar } from "./avatars"
import type { Avatar } from "./types"

const STORAGE_KEY = "forkcast:voterKey"

export interface UserIdentity {
  secretKey: Uint8Array
  pubkey: string
  avatar: Avatar
}

let _cached: UserIdentity | null = null

function loadStored(): UserIdentity | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const secretKey = hexToBytes(stored)
    const pubkey = getPublicKey(secretKey)
    return { secretKey, pubkey, avatar: getAvatar(pubkey) }
  } catch {
    return null
  }
}

export function getOrCreateIdentity(): UserIdentity {
  if (_cached) return _cached

  _cached = loadStored()
  if (_cached) return _cached

  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  localStorage.setItem(STORAGE_KEY, bytesToHex(secretKey))
  _cached = { secretKey, pubkey, avatar: getAvatar(pubkey) }
  return _cached
}

export function getIdentity(): UserIdentity | null {
  if (_cached) return _cached
  _cached = loadStored()
  return _cached
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY)
  _cached = null
}
