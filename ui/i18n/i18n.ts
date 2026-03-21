import de from './de.json'
import en from './en.json'

type TranslationStrings = Record<string, string>

const translations: Record<string, TranslationStrings> = { de, en }

let currentLanguage = 'de'
let availableLanguages: string[] = ['de']
let sourceLanguage = 'de'

const STORAGE_KEY = 'language'

export function initI18n(languages: string[]): void {
  availableLanguages = languages
  sourceLanguage = languages[0]

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && availableLanguages.includes(stored)) {
    currentLanguage = stored
  } else {
    currentLanguage = sourceLanguage
  }

  document.documentElement.lang = currentLanguage
}

export function t(key: string, params?: Record<string, string>): string {
  let value = translations[currentLanguage]?.[key] ?? translations[sourceLanguage]?.[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{{${k}}}`, v)
    }
  }
  return value
}

export function getCurrentLanguage(): string {
  return currentLanguage
}

export function getSourceLanguage(): string {
  return sourceLanguage
}

export function getAvailableLanguages(): string[] {
  return availableLanguages
}

export function setLanguage(lang: string): void {
  if (!availableLanguages.includes(lang)) return
  currentLanguage = lang
  localStorage.setItem(STORAGE_KEY, lang)
  document.documentElement.lang = lang
}

export function getNextLanguage(): string {
  const idx = availableLanguages.indexOf(currentLanguage)
  return availableLanguages[(idx + 1) % availableLanguages.length]
}

const LOCALE_MAP: Record<string, string> = {
  de: 'de-AT',
  en: 'en',
}

export function getLocale(): string {
  return LOCALE_MAP[currentLanguage] ?? currentLanguage
}
