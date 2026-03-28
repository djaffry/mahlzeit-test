import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { generateKeypair, obfuscateId, createRoomEvent } from "./nostr.js"
import { probeRelays, publishToRelays } from "./relay.js"
import { getWeekDates, readRestaurantIds, buildVotingJson, writeVotingJson } from "./voting-json.js"
import type { RelayConfig, AppConfig } from "./types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

export function validateRelayCount(count: number, min: number): void {
  if (count < min) {
    throw new Error(`Only ${count} relay(s) reachable, minimum is ${min}. Aborting.`)
  }
}

export function validateRelayConfig(data: unknown): RelayConfig {
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj?.relays) || !obj.relays.every((r: unknown) => typeof r === "string")) {
    throw new Error("relays.json: 'relays' must be an array of strings")
  }
  if (typeof obj.minRelays !== "number" || obj.minRelays < 0) {
    throw new Error("relays.json: 'minRelays' must be a non-negative number")
  }
  return { relays: obj.relays as string[], minRelays: obj.minRelays as number }
}

export function validateAppConfig(data: unknown): AppConfig {
  const obj = data as Record<string, unknown>
  if (typeof obj?.appId !== "string" || obj.appId.length === 0) {
    throw new Error("app.json: 'appId' must be a non-empty string")
  }
  if (typeof obj?.salt !== "string" || obj.salt.length === 0) {
    throw new Error("app.json: 'salt' must be a non-empty string")
  }
  return { appId: obj.appId as string, salt: obj.salt as string }
}

function loadConfig(filename: string): unknown {
  const configDir = resolve(__dirname, "..", "config")
  return JSON.parse(readFileSync(resolve(configDir, filename), "utf-8"))
}

export async function createRooms(dataDir: string): Promise<void> {
  const relayConfig = validateRelayConfig(loadConfig("relays.json"))
  const appConfig = validateAppConfig(loadConfig("app.json"))

  console.log("Generating keypair...")
  const { secretKey, pubkey } = generateKeypair()

  console.log("Reading restaurant list...")
  const restaurantIds = readRestaurantIds(dataDir)
  console.log(`Found ${restaurantIds.length} restaurants`)

  const obfuscatedIds = restaurantIds.map((id) => obfuscateId(appConfig.salt, id))

  console.log("Probing relays...")
  const liveRelays = await probeRelays(relayConfig.relays)
  console.log(`${liveRelays.length}/${relayConfig.relays.length} relays reachable: ${liveRelays.join(", ")}`)

  validateRelayCount(liveRelays.length, relayConfig.minRelays)

  const weekDates = getWeekDates(new Date())
  const weekMonday = weekDates[0]
  console.log(`Creating rooms for week of ${weekMonday}: ${weekDates.join(", ")}`)

  const rooms: Record<string, { roomEventId: string }> = {}
  const events = []

  for (const date of weekDates) {
    const event = createRoomEvent({
      secretKey,
      appId: appConfig.appId,
      date,
      options: obfuscatedIds,
    })
    rooms[date] = { roomEventId: event.id }
    events.push(event)
    console.log(`Room for ${date}: ${event.id}`)
  }

  console.log("Publishing to relays...")
  await publishToRelays(liveRelays, events)

  const votingJson = buildVotingJson({
    weekMonday,
    appId: appConfig.appId,
    pubkey,
    salt: appConfig.salt,
    relays: liveRelays,
    rooms,
  })

  writeVotingJson(dataDir, votingJson)
  console.log(`Wrote data/voting.json for week of ${weekMonday}`)
}
