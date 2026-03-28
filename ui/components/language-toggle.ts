import { getCurrentLanguage, getNextLanguage, setLanguage, getAvailableLanguages, t } from '../i18n/i18n'

export function setupLanguageToggle(onSwitch: () => void): void {
  const btn = document.getElementById('language-toggle')
  if (!btn) return

  if (getAvailableLanguages().length <= 1) {
    btn.style.display = 'none'
    return
  }

  updateButton(btn)

  btn.addEventListener('click', () => {
    const next = getNextLanguage()
    setLanguage(next)
    updateButton(btn)
    onSwitch()
  })
}

function updateButton(btn: HTMLElement): void {
  const kbd = btn.querySelector('kbd')
  btn.textContent = getCurrentLanguage().toUpperCase()
  if (kbd) btn.appendChild(kbd)
  btn.setAttribute('aria-label', t('language.ariaLabel'))
  btn.setAttribute('title', t('language.ariaLabel'))
}
