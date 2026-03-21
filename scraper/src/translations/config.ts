import { NoTokenGoogleTranslateAdapter } from './adapters/no-token-google-translate.js'
import type { TranslationConfig } from './types.js'

export const translationConfig: TranslationConfig = {
  sourceLanguage: 'de',
  targetLanguages: ['en'],
  adapter: new NoTokenGoogleTranslateAdapter(),
}
