export interface TranslationAdapter {
  name: string
  translateBatch(texts: string[], from: string, to: string): Promise<string[]>
}

export interface TranslationConfig {
  sourceLanguage: string
  targetLanguages: string[]
  adapter: TranslationAdapter
}

export interface TranslationCacheEntry {
  hash: string
}

export type TranslationCache = Record<string, TranslationCacheEntry>
