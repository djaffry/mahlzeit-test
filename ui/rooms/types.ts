export interface VotingData {
  week: string
  appId: string
  pubkey: string
  salt: string
  relays: string[]
  rooms: Record<string, { roomEventId: string }>
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
