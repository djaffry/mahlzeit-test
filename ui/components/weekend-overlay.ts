import { DAYS } from "../constants"
import { t, getCurrentLanguage, getAvailableLanguages } from '../i18n/i18n'

interface OverlayConfig {
  id: string
  emoji: string
  title: string
  text: string
  browseDay: string
}

let overlayAbort: AbortController | null = null

function renderOfflineState(
  cfg: OverlayConfig,
  onBrowse: (day: string) => void
): void {
  overlayAbort?.abort()
  overlayAbort = new AbortController()
  const { signal } = overlayAbort

  // Remove previous overlay so we don't get duplicates
  document.getElementById(cfg.id)?.remove()

  const logo = document.querySelector('.toolbar-logo')?.outerHTML ?? ''
  const title = document.querySelector('.toolbar-title')?.textContent ?? ''
  const subtitle = document.querySelector('.toolbar-subtitle')?.textContent ?? ''
  const showLang = getAvailableLanguages().length > 1

  const btnId = `${cfg.id}-browse`
  const langBtnId = `${cfg.id}-lang`
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="weekend-state" id="${cfg.id}">
      <div class="toolbar">
        <div class="toolbar-inner">
          <div class="toolbar-top">
            <div class="toolbar-brand">
              ${logo}
              <div>
                <div class="toolbar-title">${title}</div>
                <div class="toolbar-subtitle">${subtitle}</div>
              </div>
            </div>
            ${showLang ? `<div class="toolbar-actions"><button class="language-toggle" id="${langBtnId}" aria-label="${t('language.ariaLabel')}">${getCurrentLanguage().toUpperCase()}<kbd class="kbd">L</kbd></button></div>` : ''}
          </div>
        </div>
      </div>
      <div class="weekend-body">
        <div class="weekend-emoji">${cfg.emoji}</div>
        <div class="weekend-title">${cfg.title}</div>
        <div class="weekend-text">${cfg.text}</div>
        <button class="weekend-browse-btn" id="${btnId}">${t('browse.lastWeek')} <kbd class="kbd">${t('browse.escKey')}</kbd></button>
      </div>
    </div>`
  )

  function dismiss(): void {
    overlayAbort?.abort()
    overlayAbort = null
    document.getElementById(cfg.id)?.remove()
    onBrowse(cfg.browseDay)
  }

  document.getElementById(btnId)!.addEventListener("click", dismiss, { signal })
  document.getElementById(langBtnId)?.addEventListener("click", () => {
    document.getElementById("language-toggle")?.click()
  }, { signal })
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismiss()
  }, { signal })
}

export function renderWeekendState(
  onBrowse: (day: string) => void
): void {
  renderOfflineState(
    {
      id: "weekend-state",
      emoji: "\u{1F373}\u{1F372}\u{1F957}",
      title: t('weekend.title'),
      text: t('weekend.text'),
      browseDay: DAYS.at(-1)!,
    },
    onBrowse
  )
}

export function renderStaleDataState(
  activeDay: string,
  onBrowse: (day: string) => void
): void {
  renderOfflineState(
    {
      id: "stale-state",
      emoji: "\u{1F504}",
      title: t('stale.title'),
      text: t('stale.text'),
      browseDay: activeDay,
    },
    onBrowse
  )
}
