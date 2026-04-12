import {
  isVotingActive,
  toggleVote as nostrToggleVote,
  acceptVoting,
  getJoinResult,
} from "../voting/init"
import { showConsentOverlay } from "../voting/consent"
import { markSaving } from "../voting/vote-indicator"
import { haptic } from "../utils/haptic"
import type { RoomBanner } from "../voting/types"

export interface VotingFlowDeps {
  rerender: () => void
  updateVotes: () => void
  openVotingRoomsPanel: (opts?: { banner?: RoomBanner }) => void
}

export function createToggleVote(deps: VotingFlowDeps): (restaurantId: string, dayIndex: number) => Promise<void> {
  return async (restaurantId: string, dayIndex: number): Promise<void> => {
    if (!isVotingActive()) {
      showConsentOverlay({
        onAccept: async () => {
          const joinResult = getJoinResult()
          await acceptVoting()
          nostrToggleVote(restaurantId, dayIndex)
          haptic()
          deps.rerender()
          if (joinResult) {
            deps.openVotingRoomsPanel({ banner: joinResult })
          }
        },
      })
      return
    }
    markSaving(restaurantId, dayIndex)
    nostrToggleVote(restaurantId, dayIndex)
    haptic()
    deps.updateVotes()
  }
}
