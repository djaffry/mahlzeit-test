import { describe, it, expect, beforeEach } from "vitest"
import { getOrCreateIdentity, getIdentity, clearIdentity } from "./user-identity"

beforeEach(() => {
  clearIdentity()
})

describe("getOrCreateIdentity", () => {
  it("creates a new identity on first call", () => {
    const id = getOrCreateIdentity()
    expect(id.pubkey).toHaveLength(64)
    expect(id.avatar.icon).toBeTruthy()
    expect(id.avatar.color).toBeTruthy()
  })

  it("returns the same identity on subsequent calls", () => {
    const a = getOrCreateIdentity()
    const b = getOrCreateIdentity()
    expect(a.pubkey).toEqual(b.pubkey)
    expect(a.avatar).toEqual(b.avatar)
  })
})

describe("getIdentity", () => {
  it("returns null when no identity exists", () => {
    expect(getIdentity()).toBeNull()
  })

  it("returns identity after creation", () => {
    getOrCreateIdentity()
    const id = getIdentity()
    expect(id).not.toBeNull()
    expect(id!.pubkey).toHaveLength(64)
  })
})

describe("clearIdentity", () => {
  it("removes stored identity", () => {
    getOrCreateIdentity()
    clearIdentity()
    expect(getIdentity()).toBeNull()
  })
})
