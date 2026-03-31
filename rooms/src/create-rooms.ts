import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { log } from "./log.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, "..", "config")

/* ── Config validation ─────────────────────────────────── */

interface RelayConfig { relays: string[]; minRelays: number }
interface AppConfig { appId: string; salt: string }

export function validateRelayConfig(data: unknown): RelayConfig {
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj?.relays) || !obj.relays.every((r: unknown) => typeof r === "string")) {
    throw new Error("relays.json: 'relays' must be an array of strings")
  }
  if (obj.relays.length === 0) {
    throw new Error("relays.json: 'relays' must not be empty")
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
  return JSON.parse(readFileSync(resolve(configDir, filename), "utf-8"))
}

/* ── Generate voting.json ──────────────────────────────── */

export function generateVotingJson(dataDir: string): void {
  const relayConfig = validateRelayConfig(loadConfig("relays.json"))
  const appConfig = validateAppConfig(loadConfig("app.json"))

  const votingJson = {
    appId: appConfig.appId,
    salt: appConfig.salt,
    relays: relayConfig.relays,
  }

  writeFileSync(resolve(dataDir, "voting.json"), JSON.stringify(votingJson, null, 2) + "\n", "utf-8")
  log("OK", "write-voting-json", `${relayConfig.relays.length} relays`)
}

/* ── Relay health check ────────────────────────────────── */

async function probeRelay(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject() }, timeoutMs)
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve() }
      ws.onerror = () => { clearTimeout(timer); ws.close(); reject() }
    })
    return true
  } catch {
    return false
  }
}

export async function healthCheck(): Promise<void> {
  const relayConfig = validateRelayConfig(loadConfig("relays.json"))
  const results = await Promise.all(
    relayConfig.relays.map(async (url) => {
      const live = await probeRelay(url)
      log(live ? "OK" : "FAIL", "probe-relay", url)
      return live
    })
  )

  const liveCount = results.filter(Boolean).length
  if (liveCount < relayConfig.minRelays) {
    throw new Error(`Only ${liveCount}/${relayConfig.relays.length} relays reachable, minimum is ${relayConfig.minRelays}`)
  }
  log("OK", "relay-health", `${liveCount}/${relayConfig.relays.length} reachable`)
}
