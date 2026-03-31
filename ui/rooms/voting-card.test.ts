import { describe, it, expect } from "vitest"
import { renderVotingCard, renderVotingCardCollapsed } from "./voting-card"
import type { Avatar, PrivateRoom } from "./types"

const mockAvatar: Avatar = { icon: '<path d="m12 14-1 1"/>', color: "#f38ba8", iconColor: "white", label: "The Red Pizza" }

const BASE_PARAMS = {
  day: "Montag",
  userAvatar: mockAvatar,
  restaurants: [] as { id: string; name: string; voteCount: number; voters: never[]; userVoted: boolean }[],
  isReadOnly: false,
  relayStatus: new Map([["wss://relay.test", true]]),
  collapsed: false,
  activeRoom: null as PrivateRoom | null,
  knownRooms: [] as PrivateRoom[],
  roomListOpen: false,
  confirmLeaveRoomId: null as string | null,
  joinedViaUrl: false,
}

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
      activeRoom: null,
      knownRooms: [],
      roomListOpen: false,
      confirmLeaveRoomId: null,
      joinedViaUrl: false,
    })

    expect(html).toContain("voting-card")
    expect(html).toContain("Mano")
    expect(html).toContain("Bao Bar")
    expect(html).toContain("voting-avatar")
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
      activeRoom: null,
      knownRooms: [],
      roomListOpen: false,
      confirmLeaveRoomId: null,
      joinedViaUrl: false,
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
      activeRoom: null,
      knownRooms: [],
      roomListOpen: false,
      confirmLeaveRoomId: null,
      joinedViaUrl: false,
    })

    expect(html).toContain("collapsed")
  })
})

describe("room bar", () => {
  const teamA: PrivateRoom = { id: "AbCd1234", name: "Team A", joinedAt: 1 }

  it("shows current room name with chevron", () => {
    const html = renderVotingCard({ ...BASE_PARAMS })
    expect(html).toContain("voting-room-bar")
    expect(html).toContain("voting-room-current")
    expect(html).toContain("voting-room-current-name")
    expect(html).toContain("Allgemein")
  })

  it("shows private room name when active", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, activeRoom: teamA, knownRooms: [teamA] })
    expect(html).toContain("Team A")
  })

  it("shows share and rename buttons for private rooms", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, activeRoom: teamA, knownRooms: [teamA] })
    expect(html).toContain("voting-room-share")
    expect(html).toContain("voting-room-rename")
  })

  it("hides share and rename buttons for default room", () => {
    const html = renderVotingCard({ ...BASE_PARAMS })
    expect(html).not.toContain("voting-room-share")
    expect(html).not.toContain("voting-room-rename")
  })

  it("is present in collapsed card (hidden by CSS)", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, collapsed: true })
    expect(html).toContain("voting-room-bar")
    expect(html).toContain("collapsed")
  })

  it("escapes room name", () => {
    const xssRoom: PrivateRoom = { id: "xss12345", name: '<script>alert("xss")</script>', joinedAt: 1 }
    const html = renderVotingCard({ ...BASE_PARAMS, activeRoom: xssRoom, knownRooms: [xssRoom] })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("room list panel", () => {
  const teamA: PrivateRoom = { id: "AbCd1234", name: "Team A", joinedAt: 1 }
  const teamB: PrivateRoom = { id: "EfGh5678", name: "Team B", joinedAt: 2 }

  it("renders list when roomListOpen is true", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true })
    expect(html).toContain("voting-room-list")
    expect(html).not.toContain("voting-body")
  })

  it("renders vote rows when roomListOpen is false", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: false })
    expect(html).not.toContain("voting-room-list")
    expect(html).toContain("voting-body")
  })

  it("shows default room first with badge", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [teamA] })
    expect(html).toContain("Allgemein")
    expect(html).toContain("voting-room-item-badge")
    // Default room should appear before Team A
    const defaultIdx = html.indexOf("Allgemein")
    const teamIdx = html.indexOf("Team A")
    expect(defaultIdx).toBeLessThan(teamIdx)
  })

  it("shows active room with check mark", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, activeRoom: teamA, knownRooms: [teamA] })
    expect(html).toContain("voting-room-item-active")
    expect(html).toContain("voting-room-item-check")
  })

  it("shows all known rooms", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [teamA, teamB] })
    expect(html).toContain("Team A")
    expect(html).toContain("Team B")
    expect(html).toContain(`data-room-id="${teamA.id}"`)
    expect(html).toContain(`data-room-id="${teamB.id}"`)
  })

  it("shows leave button per private room", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [teamA] })
    expect(html).toContain("voting-room-item-leave")
  })

  it("shows create row at bottom", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true })
    expect(html).toContain("voting-room-item-create")
  })

  it("shows leave confirmation for matching room", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [teamA], confirmLeaveRoomId: teamA.id })
    expect(html).toContain("voting-room-item-confirm")
    expect(html).toContain("voting-room-confirm-yes")
    expect(html).toContain("voting-room-confirm-no")
  })

  it("does not show leave confirmation for non-matching room", () => {
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [teamA, teamB], confirmLeaveRoomId: teamA.id })
    // Team B should still be a normal row
    expect(html).toContain("voting-room-item-select")
  })

  it("escapes room names in list", () => {
    const xssRoom: PrivateRoom = { id: "xss12345", name: '<img onerror=alert(1)>', joinedAt: 1 }
    const html = renderVotingCard({ ...BASE_PARAMS, roomListOpen: true, knownRooms: [xssRoom] })
    expect(html).not.toContain("<img")
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
