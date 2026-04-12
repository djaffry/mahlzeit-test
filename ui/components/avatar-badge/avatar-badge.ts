import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { getOrCreateIdentity } from "../../voting/user-identity"
import { avatarSvg } from "../../voting/avatars"
import { isVotingActive, isInNonDefaultRoom, hasConsented } from "../../voting/init"

let _lastKey = ""

export function showAvatarBadge(): void {
  const badge = document.getElementById("avatar-badge")
  if (!badge) return
  const identity = getOrCreateIdentity()

  const showClaim = !isVotingActive() && !hasConsented()
  const hasRoom = isInNonDefaultRoom()
  const key = `${identity.avatar.color}|${identity.avatar.label}|${showClaim}|${hasRoom}`
  if (key === _lastKey && !badge.hidden) return
  _lastKey = key

  badge.hidden = false
  badge.style.setProperty('--avatar-color', identity.avatar.color)

  const claim = showClaim ? `<span class="avatar-badge-claim-label">${escapeHtml(t("voting.claim"))}</span>` : ""
  badge.innerHTML = `<span class="avatar-badge-icon">${avatarSvg(identity.avatar, 16)}</span><span class="avatar-badge-label">${escapeHtml(identity.avatar.label)}</span>${claim}`
  badge.classList.toggle('avatar-badge-claim', showClaim)

  badge.title = identity.avatar.label
  badge.classList.toggle('has-room', hasRoom)
}
