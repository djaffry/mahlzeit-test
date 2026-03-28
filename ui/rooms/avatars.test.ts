import { describe, it, expect } from "vitest"
import { getAvatar, FOOD_EMOJIS, AVATAR_COLORS } from "./avatars"

describe("getAvatar", () => {
  it("returns an emoji, color, and label", () => {
    const avatar = getAvatar("a".repeat(64))
    expect(FOOD_EMOJIS.map((f) => f.emoji)).toContain(avatar.emoji)
    expect(AVATAR_COLORS.map((c) => c.hex)).toContain(avatar.color)
    expect(avatar.label).toBeTruthy()
    expect(avatar.label).toMatch(/^The \w+ \w+$/)
  })

  it("is deterministic for the same pubkey", () => {
    const a = getAvatar("abcdef1234567890".repeat(4))
    const b = getAvatar("abcdef1234567890".repeat(4))
    expect(a).toEqual(b)
  })

  it("produces different avatars for different pubkeys", () => {
    const a = getAvatar("a".repeat(64))
    const b = getAvatar("b".repeat(64))
    const same = a.emoji === b.emoji && a.color === b.color
    expect(same).toBe(false)
  })
})
