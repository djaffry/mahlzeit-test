import { describe, it, expect, vi, beforeEach } from "vitest"

const mockIsVotingActive = vi.fn()
const mockShowConsentOverlay = vi.fn()
const mockAcceptVoting = vi.fn()
const mockNostrToggleVote = vi.fn()
const mockGetJoinResult = vi.fn()
const mockMarkSaving = vi.fn()
const mockHaptic = vi.fn()
const mockUpdateVotes = vi.fn()
const mockRerender = vi.fn()
const mockOpenVotingRoomsPanel = vi.fn()

vi.mock("../voting/init", () => ({
  isVotingActive: () => mockIsVotingActive(),
  toggleVote: (...args: unknown[]) => mockNostrToggleVote(...args),
  acceptVoting: () => mockAcceptVoting(),
  getJoinResult: () => mockGetJoinResult(),
}))
vi.mock("../voting/consent", () => ({
  showConsentOverlay: (opts: unknown) => mockShowConsentOverlay(opts),
}))
vi.mock("../voting/vote-indicator", () => ({
  markSaving: (...args: unknown[]) => mockMarkSaving(...args),
}))
vi.mock("../utils/haptic", () => ({ haptic: () => mockHaptic() }))

import { createToggleVote } from "./voting-flow"

describe("createToggleVote", () => {
  let toggleVote: (restaurantId: string, dayIndex: number) => Promise<void>

  beforeEach(() => {
    vi.resetAllMocks()
    mockIsVotingActive.mockReturnValue(true)
    mockGetJoinResult.mockReturnValue(null)

    toggleVote = createToggleVote({
      rerender: mockRerender,
      updateVotes: mockUpdateVotes,
      openVotingRoomsPanel: mockOpenVotingRoomsPanel,
    })
  })

  it("marks saving and toggles vote when voting is active", async () => {
    await toggleVote("r1", 2)
    expect(mockMarkSaving).toHaveBeenCalledWith("r1", 2)
    expect(mockNostrToggleVote).toHaveBeenCalledWith("r1", 2)
    expect(mockHaptic).toHaveBeenCalled()
    expect(mockUpdateVotes).toHaveBeenCalled()
  })

  it("shows consent overlay when voting is not active", async () => {
    mockIsVotingActive.mockReturnValue(false)
    await toggleVote("r1", 2)
    expect(mockShowConsentOverlay).toHaveBeenCalled()
    expect(mockMarkSaving).not.toHaveBeenCalled()
  })

  it("opens voting rooms panel after consent when joined via URL", async () => {
    mockIsVotingActive.mockReturnValue(false)
    mockGetJoinResult.mockReturnValue({ kind: "joined", name: "test-room" })

    await toggleVote("r1", 2)

    // Extract and call the onAccept callback
    const opts = mockShowConsentOverlay.mock.calls[0][0] as { onAccept: () => Promise<void> }
    await opts.onAccept()

    expect(mockAcceptVoting).toHaveBeenCalled()
    expect(mockRerender).toHaveBeenCalled()
    expect(mockOpenVotingRoomsPanel).toHaveBeenCalledWith({ banner: { kind: "joined", name: "test-room" } })
  })
})
