import { describe, it, expect } from "vitest"
import { getWeekDates, buildVotingJson, validateRestaurantIds } from "./voting-json"

describe("getWeekDates", () => {
  it("returns Mon-Fri dates for a Monday", () => {
    const dates = getWeekDates(new Date("2026-03-23"))
    expect(dates).toEqual([
      "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
    ])
  })

  it("returns same week dates for a Wednesday", () => {
    const dates = getWeekDates(new Date("2026-03-25"))
    expect(dates).toEqual([
      "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
    ])
  })

  it("returns same week dates for a Friday", () => {
    const dates = getWeekDates(new Date("2026-03-27"))
    expect(dates).toEqual([
      "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
    ])
  })
})

describe("buildVotingJson", () => {
  it("builds correct structure", () => {
    const result = buildVotingJson({
      weekMonday: "2026-03-23",
      appId: "test-uuid",
      pubkey: "abc123",
      salt: "deadbeef",
      relays: ["wss://relay.damus.io"],
      rooms: {
        "2026-03-23": { roomEventId: "evt1" },
        "2026-03-24": { roomEventId: "evt2" },
      },
    })

    expect(result.week).toBe("2026-03-23")
    expect(result.appId).toBe("test-uuid")
    expect(result.pubkey).toBe("abc123")
    expect(result.salt).toBe("deadbeef")
    expect(result.relays).toEqual(["wss://relay.damus.io"])
    expect(result.rooms["2026-03-23"].roomEventId).toBe("evt1")
  })
})

describe("validateRestaurantIds", () => {
  it("accepts valid string array", () => {
    expect(validateRestaurantIds(["mano", "baobar"])).toEqual(["mano", "baobar"])
  })

  it("rejects non-array", () => {
    expect(() => validateRestaurantIds("not-an-array")).toThrow(/must contain a JSON array/)
  })

  it("rejects array with non-strings", () => {
    expect(() => validateRestaurantIds(["valid", 42])).toThrow(/index\.json\[1\]/)
  })

  it("rejects array with empty strings", () => {
    expect(() => validateRestaurantIds(["valid", ""])).toThrow(/index\.json\[1\]/)
  })
})
