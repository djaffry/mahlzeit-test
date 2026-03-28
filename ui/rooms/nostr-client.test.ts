import { describe, it, expect } from "vitest"
import { createVoteEvent, parseVoteEvent, obfuscateId } from "./nostr-client"

describe("obfuscateId", () => {
  it("produces a 64-char hex string", async () => {
    const hash = await obfuscateId("testsalt", "deananddavid")
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic", async () => {
    const a = await obfuscateId("salt", "mano")
    const b = await obfuscateId("salt", "mano")
    expect(a).toBe(b)
  })

  // Known-answer test vector, must match the backend implementation
  it("matches known test vector", async () => {
    const hash = await obfuscateId("testsalt", "deananddavid")
    expect(hash).toBe("5834a4895266ec4a07514a9f8701dc61e7e35cd8db73750584c4519e261e31e9")
  })
})

describe("createVoteEvent", () => {
  it("creates a kind 30078 event template", () => {
    const template = createVoteEvent({
      appId: "test-uuid",
      date: "2026-03-24",
      roomEventId: "evt123",
      votedIds: ["hash1", "hash2"],
    })

    expect(template.kind).toBe(30078)
    expect(template.tags).toContainEqual(["d", "test-uuid/vote/2026-03-24"])
    expect(template.tags).toContainEqual(["e", "evt123"])

    const content = JSON.parse(template.content)
    expect(content.votes).toEqual(["hash1", "hash2"])
  })
})

describe("parseVoteEvent", () => {
  it("extracts pubkey and votes from a vote event", () => {
    const event = {
      kind: 30078,
      pubkey: "abc",
      created_at: 1000,
      tags: [["d", "uuid/vote/2026-03-24"], ["e", "evt123"]],
      content: JSON.stringify({ votes: ["hash1", "hash2"] }),
      id: "evtid",
      sig: "sig",
    }

    const parsed = parseVoteEvent(event)
    expect(parsed).not.toBeNull()
    expect(parsed!.pubkey).toBe("abc")
    expect(parsed!.votes).toEqual(["hash1", "hash2"])
    expect(parsed!.createdAt).toBe(1000)
  })

  it("returns null for malformed content", () => {
    const event = {
      kind: 30078,
      pubkey: "abc",
      created_at: 1000,
      tags: [],
      content: "not json",
      id: "evtid",
      sig: "sig",
    }

    expect(parseVoteEvent(event)).toBeNull()
  })

  it("returns null when votes contain non-string elements", () => {
    const event = {
      kind: 30078,
      pubkey: "abc",
      created_at: 1000,
      tags: [],
      content: JSON.stringify({ votes: ["valid", 42, { xss: true }] }),
      id: "evtid",
      sig: "sig",
    }

    expect(parseVoteEvent(event)).toBeNull()
  })
})
