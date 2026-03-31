import { healthCheck } from "./create-rooms.js"
import { log } from "./log.js"

healthCheck().catch((err) => {
  log("FAIL", "health-check", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
