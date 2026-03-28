import { Relay } from "nostr-tools/relay"
import type { VerifiedEvent } from "nostr-tools/pure"

export async function probeRelay(url: string, timeoutMs = 5000): Promise<boolean> {
  const relay = new Relay(url)
  try {
    await relay.connect({ abort: AbortSignal.timeout(timeoutMs) })
    relay.close()
    return true
  } catch {
    relay.close()
    return false
  }
}

export async function probeRelays(relays: string[], timeoutMs = 5000): Promise<string[]> {
  const results = await Promise.all(
    relays.map(async (url) => ({ url, live: await probeRelay(url, timeoutMs) }))
  )
  return results.filter((r) => r.live).map((r) => r.url)
}

export async function publishToRelays(
  relays: string[],
  events: VerifiedEvent[]
): Promise<void> {
  await Promise.allSettled(relays.map(async (url) => {
    const relay = new Relay(url)
    try {
      await relay.connect({ abort: AbortSignal.timeout(10000) })
      await Promise.all(events.map((event) => relay.publish(event)))
    } catch (err) {
      console.error(`Failed to publish to ${url}:`, err)
    } finally {
      relay.close()
    }
  }))
}
