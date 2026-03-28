export interface RelayConfig {
  relays: string[]
  minRelays: number
}

export interface AppConfig {
  appId: string
  salt: string
}

export interface VotingJson {
  week: string
  appId: string
  pubkey: string
  salt: string
  relays: string[]
  rooms: Record<string, { roomEventId: string }>
}
