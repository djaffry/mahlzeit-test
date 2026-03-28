import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRooms } from "./create-rooms.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, "..", "..", "data")

createRooms(dataDir).catch((err) => {
  console.error("Room creation failed:", err)
  process.exit(1)
})
