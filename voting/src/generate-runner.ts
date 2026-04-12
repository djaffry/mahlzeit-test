import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { generateVotingJson } from "./create-rooms.js"
import { log } from "./log.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, "..", "..", "data")

try {
  generateVotingJson(dataDir)
} catch (err) {
  log("FAIL", "generate-voting-json", err instanceof Error ? err.message : String(err))
  process.exit(1)
}
