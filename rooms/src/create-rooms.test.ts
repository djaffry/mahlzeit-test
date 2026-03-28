import { describe, it, expect } from "vitest"
import { validateRelayCount, validateRelayConfig, validateAppConfig } from "./create-rooms"

describe("validateRelayCount", () => {
  it("throws when below minimum", () => {
    expect(() => validateRelayCount(1, 2)).toThrow(
      /Only 1 relay\(s\) reachable, minimum is 2/
    )
  })

  it("does not throw when at minimum", () => {
    expect(() => validateRelayCount(2, 2)).not.toThrow()
  })

  it("does not throw when above minimum", () => {
    expect(() => validateRelayCount(3, 2)).not.toThrow()
  })
})

describe("validateRelayConfig", () => {
  it("accepts valid config", () => {
    const config = validateRelayConfig({ relays: ["wss://r.test"], minRelays: 1 })
    expect(config.relays).toEqual(["wss://r.test"])
    expect(config.minRelays).toBe(1)
  })

  it("rejects missing relays", () => {
    expect(() => validateRelayConfig({ minRelays: 1 })).toThrow(/relays/)
  })

  it("rejects non-array relays", () => {
    expect(() => validateRelayConfig({ relays: "wss://r.test", minRelays: 1 })).toThrow(/relays/)
  })

  it("rejects missing minRelays", () => {
    expect(() => validateRelayConfig({ relays: ["wss://r.test"] })).toThrow(/minRelays/)
  })

  it("rejects negative minRelays", () => {
    expect(() => validateRelayConfig({ relays: ["wss://r.test"], minRelays: -1 })).toThrow(/minRelays/)
  })
})

describe("validateAppConfig", () => {
  it("accepts valid config", () => {
    const config = validateAppConfig({ appId: "test-uuid", salt: "abc123" })
    expect(config.appId).toBe("test-uuid")
    expect(config.salt).toBe("abc123")
  })

  it("rejects missing appId", () => {
    expect(() => validateAppConfig({ salt: "abc123" })).toThrow(/appId/)
  })

  it("rejects empty appId", () => {
    expect(() => validateAppConfig({ appId: "", salt: "abc123" })).toThrow(/appId/)
  })

  it("rejects missing salt", () => {
    expect(() => validateAppConfig({ appId: "test-uuid" })).toThrow(/salt/)
  })

  it("rejects empty salt", () => {
    expect(() => validateAppConfig({ appId: "test-uuid", salt: "" })).toThrow(/salt/)
  })
})
