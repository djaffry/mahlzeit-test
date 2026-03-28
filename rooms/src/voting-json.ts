import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { VotingJson } from "./types.js"

export function getWeekDates(now: Date): string[] {
  const day = now.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setUTCDate(monday.getUTCDate() + diffToMonday)
  monday.setUTCHours(0, 0, 0, 0)

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export function validateRestaurantIds(data: unknown): string[] {
  if (!Array.isArray(data)) {
    throw new Error("index.json must contain a JSON array")
  }
  for (let i = 0; i < data.length; i++) {
    if (typeof data[i] !== "string" || data[i].length === 0) {
      throw new Error(`index.json[${i}] must be a non-empty string`)
    }
  }
  return data as string[]
}

export function readRestaurantIds(dataDir: string): string[] {
  const indexPath = resolve(dataDir, "index.json")
  const content = readFileSync(indexPath, "utf-8")
  return validateRestaurantIds(JSON.parse(content))
}

export interface BuildVotingJsonParams {
  weekMonday: string
  appId: string
  pubkey: string
  salt: string
  relays: string[]
  rooms: Record<string, { roomEventId: string }>
}

export function buildVotingJson(params: BuildVotingJsonParams): VotingJson {
  return {
    week: params.weekMonday,
    appId: params.appId,
    pubkey: params.pubkey,
    salt: params.salt,
    relays: params.relays,
    rooms: params.rooms,
  }
}

export function writeVotingJson(dataDir: string, data: VotingJson): void {
  const outPath = resolve(dataDir, "voting.json")
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}
