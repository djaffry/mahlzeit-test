import { describe, it, expect } from "vitest"
import { generateKeypair, createRoomEvent, obfuscateId } from "./nostr"

describe("generateKeypair", () => {
  it("returns a secret key and hex public key", () => {
    const { secretKey, pubkey } = generateKeypair()
    expect(secretKey).toBeInstanceOf(Uint8Array)
    expect(secretKey.length).toBe(32)
    expect(typeof pubkey).toBe("string")
    expect(pubkey.length).toBe(64)
  })
})

describe("obfuscateId", () => {
  it("produces a 64-char hex string", () => {
    const hash = obfuscateId("abc123salt", "deananddavid")
    expect(hash.length).toBe(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic", () => {
    const a = obfuscateId("salt", "mano")
    const b = obfuscateId("salt", "mano")
    expect(a).toBe(b)
  })

  // Known-answer test vector, must match the frontend implementation
  it("matches known test vector", () => {
    const hash = obfuscateId("testsalt", "deananddavid")
    expect(hash).toBe("5834a4895266ec4a07514a9f8701dc61e7e35cd8db73750584c4519e261e31e9")
  })

  it("differs for different restaurants", () => {
    const a = obfuscateId("salt", "mano")
    const b = obfuscateId("salt", "baobar")
    expect(a).not.toBe(b)
  })

  it("differs for different salts", () => {
    const a = obfuscateId("salt1", "mano")
    const b = obfuscateId("salt2", "mano")
    expect(a).not.toBe(b)
  })
})

describe("createRoomEvent", () => {
  it("creates a signed kind 30078 event with correct tags", () => {
    const { secretKey, pubkey } = generateKeypair()
    const appId = "test-app-uuid"
    const date = "2026-03-24"
    const options = ["abc123", "def456"]

    const event = createRoomEvent({ secretKey, appId, date, options })

    expect(event.kind).toBe(30078)
    expect(event.pubkey).toBe(pubkey)

    const dTag = event.tags.find((t: string[]) => t[0] === "d")
    expect(dTag).toBeTruthy()
    expect(dTag![1]).toBe(`${appId}/room/${date}`)

    const content = JSON.parse(event.content)
    expect(content.options).toEqual(options)
    expect(content.date).toBe(date)

    expect(typeof event.id).toBe("string")
    expect(typeof event.sig).toBe("string")
  })
})
