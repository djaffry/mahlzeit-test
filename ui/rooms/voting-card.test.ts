import { describe, it, expect } from "vitest"
import { renderVotingCard, renderVotingCardCollapsed } from "./voting-card"
import type { Avatar } from "./types"

const mockAvatar: Avatar = { emoji: "\u{1F355}", color: "#f38ba8", label: "\u{1F355} coral" }

describe("renderVotingCard", () => {
  it("renders card with header and restaurant rows", () => {
    const html = renderVotingCard({
      day: "Montag",
      userAvatar: mockAvatar,
      restaurants: [
        { id: "mano", name: "Mano", voteCount: 3, voters: [], userVoted: true },
        { id: "baobar", name: "Bao Bar", voteCount: 1, voters: [], userVoted: false },
      ],
      isReadOnly: false,
      relayStatus: new Map([["wss://relay.test", true]]),
      collapsed: false,
    })

    expect(html).toContain("voting-card")
    expect(html).toContain("Mano")
    expect(html).toContain("Bao Bar")
    expect(html).toContain("\u{1F355}")
    expect(html).toContain("3")
  })

  it("renders read-only for past days", () => {
    const html = renderVotingCard({
      day: "Montag",
      userAvatar: mockAvatar,
      restaurants: [],
      isReadOnly: true,
      relayStatus: new Map([["wss://relay.test", true]]),
      collapsed: false,
    })

    expect(html).toContain("voting-past")
  })

  it("renders collapsed state", () => {
    const html = renderVotingCard({
      day: "Montag",
      userAvatar: mockAvatar,
      restaurants: [
        { id: "mano", name: "Mano", voteCount: 5, voters: [], userVoted: false },
      ],
      isReadOnly: false,
      relayStatus: new Map([["wss://relay.test", true]]),
      collapsed: true,
    })

    expect(html).toContain("collapsed")
  })
})

describe("renderVotingCardCollapsed", () => {
  it("shows leading restaurant in summary", () => {
    const html = renderVotingCardCollapsed({
      totalVoters: 5,
      leadingRestaurant: "Bao Bar",
    })

    expect(html).toContain("5")
    expect(html).toContain("Bao Bar")
  })

  it("shows no votes message when empty", () => {
    const html = renderVotingCardCollapsed({
      totalVoters: 0,
      leadingRestaurant: null,
    })

    expect(html).toContain("(Noch) keine Stimmen")
  })
})
