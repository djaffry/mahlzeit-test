import { describe, it, expect } from "vitest"
import { probeRelay, probeRelays } from "./relay"

describe("probeRelay", () => {
  it("returns false for an unreachable relay", async () => {
    const result = await probeRelay("wss://this-relay-does-not-exist.invalid", 2000)
    expect(result).toBe(false)
  })
})

describe("probeRelays", () => {
  it("filters to only live relays", async () => {
    const relays = [
      "wss://this-does-not-exist-1.invalid",
      "wss://this-does-not-exist-2.invalid",
    ]
    const live = await probeRelays(relays, 2000)
    expect(live.length).toBe(0)
  })
})
