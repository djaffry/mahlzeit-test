import "./voting-rooms-panel.css"
import { escapeHtml } from "../../utils/dom"
import { haptic } from "../../utils/haptic"
import { t } from "../../i18n/i18n"
import { icons } from "../../icons"
import { openOverlay } from "../overlay/overlay"
import { getEffectiveTheme } from "../theme-toggle/theme-toggle"
import { FONT_STACK, COLOR_MOCHA, COLOR_LATTE } from "../../utils/canvas"
import { exportImage } from "../share/share-export"
import { avatarSvg, avatarToImage } from "../../voting/avatars"
import { getOrCreateIdentity } from "../../voting/user-identity"
import {
  isVotingActive,
  getActiveRoom,
  getKnownRooms,
  createRoom,
  switchToRoom,
  leaveRoom,
  renameRoom,
  encodeRoomPayload,
} from "../../voting/init"
import type { Avatar, PrivateRoom, RoomBanner } from "../../voting/types"

let _open = false

export function openVotingRoomsPanel(opts?: { banner?: RoomBanner }): void {
  if (_open) return
  _open = true

  const banner = opts?.banner

  const { panel, close } = openOverlay({
    minWidth: "300px",
    onClose: () => { _open = false },
    onLangChange: () => renderPanelContent(panel),
  })

  renderPanelContent(panel)

  function renderPanelContent(container: HTMLElement): void {
    container.innerHTML = ""

    const header = document.createElement("div")
    header.className = "vr-header"
    const title = document.createElement("div")
    title.className = "vr-title"
    title.textContent = t("voting.rooms") ?? "Voting rooms"
    const closeBtn = document.createElement("button")
    closeBtn.className = "vr-close"
    closeBtn.innerHTML = icons.x
    closeBtn.addEventListener("click", close)
    header.appendChild(title)
    header.appendChild(closeBtn)
    container.appendChild(header)

    if (banner) {
      const i18nKey = banner.kind === "alreadyIn" ? "voting.alreadyInRoom" : "voting.joinedRoom"
      const fallback = banner.kind === "alreadyIn" ? `Already in "${banner.name}"` : `You joined "${banner.name}"`
      const bannerEl = document.createElement("div")
      bannerEl.className = "vr-joined-banner"
      bannerEl.textContent = t(i18nKey, { room: banner.name }) ?? fallback
      container.appendChild(bannerEl)
    }

    const identity = getOrCreateIdentity()
    const identityRow = document.createElement("div")
    identityRow.className = "vr-identity"

    const avatarEl = document.createElement("span")
    avatarEl.className = "vr-avatar"
    avatarEl.style.background = identity.avatar.color
    avatarEl.innerHTML = avatarSvg(identity.avatar, 16)

    const labelEl = document.createElement("span")
    labelEl.className = "vr-identity-label"
    labelEl.textContent = identity.avatar.label

    const shareIdBtn = document.createElement("button")
    shareIdBtn.className = "vr-copy-btn"
    shareIdBtn.innerHTML = icons.copy
    shareIdBtn.title = t("voting.shareAvatar") ?? "Share avatar card"
    shareIdBtn.addEventListener("click", () => {
      haptic()
      shareAvatarCard(identity.avatar).catch((e) => console.debug("[voting-rooms]", e))
    })

    const prefixEl = document.createElement("span")
    prefixEl.className = "identity-prefix"
    prefixEl.textContent = t("voting.iAm") ?? "I am"

    identityRow.appendChild(prefixEl)
    identityRow.appendChild(avatarEl)
    identityRow.appendChild(labelEl)
    identityRow.appendChild(shareIdBtn)
    container.appendChild(identityRow)

    if (!isVotingActive()) {
      const msg = document.createElement("div")
      msg.className = "vr-not-connected"
      msg.textContent = t("voting.notConnected") ?? "Join the vote to start"
      container.appendChild(msg)
    }

    const list = document.createElement("div")
    list.className = "vr-room-list"

    const activeRoom = getActiveRoom()
    const knownRooms = getKnownRooms()

    list.appendChild(
      createRoomRow(
        t("voting.defaultRoom") ?? "General",
        activeRoom === null,
        null,
      ),
    )

    for (const room of knownRooms) {
      list.appendChild(
        createRoomRow(room.name, activeRoom?.id === room.id, room),
      )
    }

    container.appendChild(list)

    const createBtn = document.createElement("button")
    createBtn.className = "vr-create-btn"
    createBtn.innerHTML = `<span class="vr-create-icon">+</span><span>${escapeHtml(t("voting.createNewRoom") ?? "Create new room")}</span>`
    createBtn.addEventListener("click", () => {
      haptic()
      const name = prompt(t("voting.createRoomPrompt") ?? "Name for the new room:")
      if (name?.trim()) {
        createRoom(name.trim())
        renderPanelContent(container)
      }
    })
    container.appendChild(createBtn)
  }

  function createRoomRow(
    name: string,
    isActive: boolean,
    room: PrivateRoom | null,
  ): HTMLElement {
    const row = document.createElement("div")
    row.className = isActive ? "vr-room-row active" : "vr-room-row"

    const checkWrap = document.createElement("span")
    checkWrap.className = "vr-room-check"
    if (isActive) checkWrap.innerHTML = icons.check
    row.appendChild(checkWrap)

    const nameEl = document.createElement("span")
    nameEl.className = "vr-room-name"
    nameEl.textContent = name
    row.appendChild(nameEl)

    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return
      haptic()
      switchToRoom(room)
      renderPanelContent(panel)
    })

    if (room) {
      const actions = document.createElement("span")
      actions.className = "vr-room-actions"

      const renameBtn = document.createElement("button")
      renameBtn.className = "vr-action-btn"
      renameBtn.innerHTML = icons.pencil
      renameBtn.title = t("voting.renameRoom") ?? "Rename"
      renameBtn.addEventListener("click", () => {
        haptic()
        const newName = prompt(
          t("voting.renameRoomPrompt") ?? "New name for the room:",
          room.name,
        )
        if (newName?.trim() && newName.trim() !== room.name) {
          renameRoom(room.id, newName.trim())
          renderPanelContent(panel)
        }
      })
      actions.appendChild(renameBtn)

      const shareBtn = document.createElement("button")
      shareBtn.className = "vr-action-btn"
      shareBtn.innerHTML = icons.link
      shareBtn.title = t("voting.shareRoom") ?? "Share room invite link"
      shareBtn.addEventListener("click", () => {
        haptic()
        const encoded = encodeRoomPayload(room)
        const url = new URL(window.location.href)
        url.search = ""
        url.searchParams.set("room", encoded)
        navigator.clipboard.writeText(url.toString()).then(() => {
          shareBtn.innerHTML = icons.check
          setTimeout(() => { shareBtn.innerHTML = icons.link }, 1500)
        }).catch((e) => console.debug("[voting-rooms]", e))
      })
      actions.appendChild(shareBtn)

      const leaveBtn = document.createElement("button")
      leaveBtn.className = "vr-action-btn leave"
      leaveBtn.innerHTML = icons.logOut
      leaveBtn.title = t("voting.leaveRoom") ?? "Leave room"
      leaveBtn.addEventListener("click", () => {
        haptic()
        const msg = t("voting.leaveConfirm", { room: room.name }) ?? `Leave "${room.name}"?`
        if (confirm(msg)) {
          leaveRoom(room.id)
          renderPanelContent(panel)
        }
      })
      actions.appendChild(leaveBtn)

      row.appendChild(actions)
    }

    return row
  }
}

/* ── Avatar business card ────────────────────────────────── */

const CARD_W = 400
const CARD_H = 200

async function shareAvatarCard(avatar: Avatar): Promise<void> {
  const isLatte = getEffectiveTheme() === "light"
  const COLOR = isLatte ? COLOR_LATTE : COLOR_MOCHA

  const canvas = document.createElement("canvas")
  canvas.width = CARD_W * 2
  canvas.height = CARD_H * 2
  const ctx = canvas.getContext("2d")!
  ctx.scale(2, 2)

  ctx.fillStyle = COLOR.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const circleR = 32
  const cx = CARD_W / 2
  const cy = 60
  ctx.beginPath()
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2)
  ctx.fillStyle = avatar.color
  ctx.fill()

  try {
    const img = await avatarToImage(avatar, circleR * 2)
    const iconSize = Math.round(circleR * 1.2)
    ctx.drawImage(img, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize)
  } catch (e) { console.debug("[voting-rooms]", e) }

  const greeting = t("voting.businessCard", { avatar: avatar.label })
  const nameStart = greeting.indexOf(avatar.label)
  const prefix = nameStart >= 0 ? greeting.slice(0, nameStart).trim() : greeting
  const name = nameStart >= 0 ? avatar.label : ""

  ctx.textAlign = "center"
  if (prefix) {
    ctx.font = `500 14px ${FONT_STACK}`
    ctx.fillStyle = COLOR.muted
    ctx.fillText(prefix, cx, cy + circleR + 28)
  }

  ctx.font = `700 20px ${FONT_STACK}`
  ctx.fillStyle = COLOR.text
  ctx.fillText(name || greeting, cx, cy + circleR + 54)

  await exportImage(canvas, "avatar-card")
}
