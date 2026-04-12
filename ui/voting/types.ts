import type { Voter } from "../types"

export interface VotingData {
  appId: string
  salt: string
  relays: string[]
}

export interface UserVote {
  pubkey: string
  votes: string[]
  createdAt: number
}

export interface Avatar {
  icon: string
  color: string
  iconColor: string
  label: string
}

/** A private room known to this browser */
export interface PrivateRoom {
  id: string
  name: string
  joinedAt: number
}

/** Discriminated union for subscribe/publish targeting */
export type RoomTarget =
  | { type: "default"; date: string }
  | { type: "private"; roomId: string; date: string }

export interface VoteMapEntry {
  count: number
  userVoted: boolean
  voters: Voter[]
}

export type RoomBanner =
  | { kind: "joined"; name: string }
  | { kind: "alreadyIn"; name: string }
