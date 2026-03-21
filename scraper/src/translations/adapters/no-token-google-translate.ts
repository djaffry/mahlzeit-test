import type { TranslationAdapter } from '../types.js'

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single'
const REQUEST_TIMEOUT_MS = 5000
const INTER_REQUEST_DELAY_MS = 200
const MAX_CHARS_PER_REQUEST = 4000
const SEPARATOR = '\n'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class NoTokenGoogleTranslateAdapter implements TranslationAdapter {
  name = 'no-token-google-translate-adapter'


  async translateBatch(texts: string[], from: string, to: string): Promise<string[]> {
    const indexMap: number[] = []
    const toTranslate: string[] = []
    const results: string[] = [...texts]

    for (let i = 0; i < texts.length; i++) {
      if (!texts[i] || texts[i].trim() === '') continue
      indexMap.push(i)
      toTranslate.push(texts[i].replace(/\n/g, ' '))
    }

    if (toTranslate.length === 0) return results

    const chunks: string[][] = []
    const chunkIndexMaps: number[][] = []
    let currentChunk: string[] = []
    let currentIndices: number[] = []
    let currentSize = 0

    for (let i = 0; i < toTranslate.length; i++) {
      const text = toTranslate[i]
      if (currentSize + text.length + SEPARATOR.length > MAX_CHARS_PER_REQUEST && currentChunk.length > 0) {
        chunks.push(currentChunk)
        chunkIndexMaps.push(currentIndices)
        currentChunk = []
        currentIndices = []
        currentSize = 0
      }
      currentChunk.push(text)
      currentIndices.push(indexMap[i])
      currentSize += text.length + SEPARATOR.length
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
      chunkIndexMaps.push(currentIndices)
    }

    for (let c = 0; c < chunks.length; c++) {
      try {
        const joined = chunks[c].join(SEPARATOR)
        const translated = await this.translateSingle(joined, from, to)
        const parts = translated.split(SEPARATOR)

        for (let i = 0; i < chunkIndexMaps[c].length; i++) {
          if (i < parts.length && parts[i].trim()) {
            results[chunkIndexMaps[c][i]] = parts[i].trim()
          }
        }
      } catch (error) {
        console.warn(`Batch translation failed for chunk ${c + 1}/${chunks.length}: ${error}`)
      }

      if (c < chunks.length - 1) {
        await sleep(INTER_REQUEST_DELAY_MS)
      }
    }

    return results
  }

  private async translateSingle(text: string, from: string, to: string): Promise<string> {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from,
      tl: to,
      dt: 't',
      q: text,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    if (data?.[0]) {
      return data[0]
        .filter((part: unknown[]) => part?.[0])
        .map((part: unknown[]) => part[0])
        .join('')
    }
    return text
  }
}
