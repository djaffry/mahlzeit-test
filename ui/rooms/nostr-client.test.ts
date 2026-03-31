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
  it("creates a default room event with vote d-tag", () => {
    const template = createVoteEvent({
      appId: "test-uuid",
      target: { type: "default", date: "2026-03-24" },
      votedIds: ["hash1", "hash2"],
    })

    expect(template.kind).toBe(30078)
    expect(template.tags).toContainEqual(["d", "test-uuid/vote/2026-03-24"])
    expect(template.tags).toHaveLength(1)

    const content = JSON.parse(template.content)
    expect(content.votes).toEqual(["hash1", "hash2"])
  })

  it("creates a private room event with pvote d-tag", () => {
    const template = createVoteEvent({
      appId: "test-uuid",
      target: { type: "private", roomId: "AbCd1234", date: "2026-03-24" },
      votedIds: ["hash1"],
    })

    expect(template.kind).toBe(30078)
    expect(template.tags).toContainEqual(["d", "test-uuid/pvote/AbCd1234/2026-03-24"])
    expect(template.tags).toHaveLength(1)

    const content = JSON.parse(template.content)
    expect(content.votes).toEqual(["hash1"])
  })

  it("creates event with empty votedIds", () => {
    const template = createVoteEvent({
      appId: "test-uuid",
      target: { type: "default", date: "2026-03-24" },
      votedIds: [],
    })

    const content = JSON.parse(template.content)
    expect(content.votes).toEqual([])
  })

  it("default and private d-tags never collide", () => {
    const defaultTag = createVoteEvent({
      appId: "app",
      target: { type: "default", date: "2026-03-24" },
      votedIds: [],
    }).tags[0][1]

    const privateTag = createVoteEvent({
      appId: "app",
      target: { type: "private", roomId: "vote", date: "2026-03-24" },
      votedIds: [],
    }).tags[0][1]

    expect(defaultTag).not.toBe(privateTag)
    expect(defaultTag).toBe("app/vote/2026-03-24")
    expect(privateTag).toBe("app/pvote/vote/2026-03-24")
  })

  it("includes roomId in private d-tag to isolate rooms", () => {
    const room1 = createVoteEvent({
      appId: "app",
      target: { type: "private", roomId: "room1", date: "2026-03-24" },
      votedIds: [],
    }).tags[0][1]

    const room2 = createVoteEvent({
      appId: "app",
      target: { type: "private", roomId: "room2", date: "2026-03-24" },
      votedIds: [],
    }).tags[0][1]

    expect(room1).not.toBe(room2)
  })

  it("sets created_at to current time in seconds", () => {
    const before = Math.floor(Date.now() / 1000)
    const template = createVoteEvent({
      appId: "app",
      target: { type: "default", date: "2026-03-24" },
      votedIds: [],
    })
    const after = Math.floor(Date.now() / 1000)

    expect(template.created_at).toBeGreaterThanOrEqual(before)
    expect(template.created_at).toBeLessThanOrEqual(after)
  })
})

describe("parseVoteEvent", () => {
  it("extracts pubkey and votes from a vote event", () => {
    const event = {
      kind: 30078,
      pubkey: "abc",
      created_at: 1000,
      tags: [["d", "uuid/vote/2026-03-24"]],
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
