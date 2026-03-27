import { NoTokenGoogleTranslateAdapter } from './adapters/no-token-google-translate.js'
import type { TranslationConfig } from './types.js'
import { SOURCE_LANGUAGE, TARGET_LANGUAGES } from '../config.js'

export const translationConfig: TranslationConfig = {
  sourceLanguage: SOURCE_LANGUAGE,
  targetLanguages: TARGET_LANGUAGES,
  adapter: new NoTokenGoogleTranslateAdapter(),
}
