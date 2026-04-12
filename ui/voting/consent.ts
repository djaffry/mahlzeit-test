import "./consent.css"
import { escapeHtml } from "../utils/dom"
import { t } from "../i18n/i18n"
import { icons } from "../icons"
import { openOverlay } from "../components/overlay/overlay"
import { getOrCreateIdentity } from "./user-identity"
import { avatarSvg } from "./avatars"
import { getRelayUrls } from "./init"

const CONSENT_SEEN_KEY = "peckish:consentSeen"

export function isConsentSeen(): boolean {
  return localStorage.getItem(CONSENT_SEEN_KEY) === "1"
}

export function markConsentSeen(): void {
  localStorage.setItem(CONSENT_SEEN_KEY, "1")
}

export interface ConsentOptions {
  onAccept: () => void | Promise<void>
}

let _open = false

export function showConsentOverlay(opts: ConsentOptions): void {
  if (_open) return
  _open = true

  const { panel, close } = openOverlay({
    minWidth: "320px",
    onClose: () => { _open = false },
    onLangChange: () => render(),
    dismissable: false,
  })

  function render(): void {
    const identity = getOrCreateIdentity()
    const relayList = getRelayUrls().map((url) => `<li>${escapeHtml(url)}</li>`).join("")

    panel.innerHTML = `
      <div class="overlay-header">
        <span class="overlay-title">${escapeHtml(t("voting.cardTitle"))}</span>
        <button class="icon-btn overlay-close-btn">${icons.x}</button>
      </div>
      <div class="consent-body">
        <p class="consent-description">${escapeHtml(t("voting.consentDescription"))}</p>
        <div class="consent-identity">
          <span class="identity-prefix">${escapeHtml(t("voting.iAm"))}</span>
          <span class="consent-avatar" style="background:${escapeHtml(identity.avatar.color)}">${avatarSvg(identity.avatar, 20)}</span>
          <span class="consent-identity-label">${escapeHtml(identity.avatar.label)}</span>
        </div>
        <p class="consent-muted">${escapeHtml(t("voting.consentRelays"))}</p>
        <ul class="consent-relay-list">${relayList}</ul>
        <div class="consent-fine-print">
          <p>${escapeHtml(t("voting.consentPrivacy"))}</p>
          <p>${escapeHtml(t("voting.consentIdentity"))}</p>
        </div>
        <button class="consent-accept">${escapeHtml(t("voting.consentAccept"))}</button>
      </div>
    `

    panel.querySelector(".overlay-close-btn")?.addEventListener("click", close)

    panel.querySelector(".consent-accept")?.addEventListener("click", () => {
      close()
      opts.onAccept()
    })
  }

  render()
}
