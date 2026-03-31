import { escapeHtml } from "../utils/dom"
import { SVG } from "../constants"
import { t } from "../i18n/i18n"
import { avatarSvg } from "./avatars"
import type { Avatar, PrivateRoom } from "./types"

/* ── Types ────────────────────────────────────────────────── */

export interface VoterInfo {
  pubkey: string
  avatar: Avatar
}

export interface RestaurantVoteRow {
  id: string
  name: string
  voteCount: number
  voters: VoterInfo[]
  userVoted: boolean
}

export interface VotingCardParams {
  day: string
  userAvatar: Avatar
  restaurants: RestaurantVoteRow[]
  isReadOnly: boolean
  relayStatus: Map<string, boolean>
  collapsed: boolean
  activeRoom: PrivateRoom | null
  knownRooms: readonly PrivateRoom[]
  roomListOpen: boolean
  confirmLeaveRoomId: string | null
  joinedViaUrl: boolean
}

export interface CollapsedSummary {
  totalVoters: number
  leadingRestaurant: string | null
}

/* ── Rendering ────────────────────────────────────────────── */

const COPY_ICON = '<svg class="voting-identity-copy" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg>'

function renderAvatarBadge(avatar: Avatar, isUser = false): string {
  const cls = isUser ? "voting-avatar voting-avatar-user" : "voting-avatar"
  return `<span class="${cls}" style="background:${avatar.color}" title="${escapeHtml(avatar.label)}">${avatarSvg(avatar)}</span>`
}

function renderIdentityBadge(avatar: Avatar): string {
  return `<span class="voting-identity" title="${escapeHtml(t("voting.yourAvatar"))}">${renderAvatarBadge(avatar, true)}<span class="voting-identity-label">${escapeHtml(avatar.label)}</span>${COPY_ICON}</span>`
}

function renderVoteRow(row: RestaurantVoteRow, isReadOnly: boolean): string {
  const btnClass = row.userVoted ? "voting-btn voting-btn-active" : "voting-btn"
  const disabled = isReadOnly ? " disabled" : ""
  const voters = row.voters.map((v) => renderAvatarBadge(v.avatar)).join("")

  return `
    <div class="voting-listbox-row voting-row" data-restaurant-id="${escapeHtml(row.id)}">
      <button class="${btnClass}"${disabled} aria-label="${escapeHtml(row.name)}">
        <svg class="voting-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${CHECK_PATH}</svg>
      </button>
      <span class="voting-name">${escapeHtml(row.name)}</span>
      <span class="voting-voters">${voters}</span>
      <span class="voting-count">${row.voteCount || ""}</span>
      <span class="voting-row-status"></span>
    </div>`
}

export function renderVotingCardCollapsed(summary: CollapsedSummary): string {
  if (summary.totalVoters === 0) {
    return `<span class="voting-summary">${t("voting.noVotes")}</span>`
  }
  const countText = summary.totalVoters === 1
    ? t("voting.voteSingular")
    : t("voting.votes", { count: String(summary.totalVoters) })
  const leading = summary.leadingRestaurant
    ? `${t("voting.leading", { restaurant: summary.leadingRestaurant })}`
    : ""
  return `<span class="voting-summary">${leading} &middot; ${countText}</span>`
}

export interface ConsentCardParams {
  userAvatar: Avatar
  relayUrls: string[]
  highlight: boolean
}

export function renderConsentCard(params: ConsentCardParams): string {
  const { userAvatar, relayUrls, highlight } = params
  const relayList = relayUrls.map((url) => `<li>${escapeHtml(url)}</li>`).join("")
  const highlightClass = highlight ? " voting-highlight" : ""

  return `
    <div class="restaurant-card voting-card voting-consent visible settled${highlightClass}">
      <div class="restaurant-header">
        <div class="restaurant-name">${t("voting.cardTitle")}</div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="voting-consent-body">
          <p>${t("voting.consentDescription")}</p>
          ${renderIdentityBadge(userAvatar)}
          <p class="voting-consent-muted">${t("voting.consentRelays")}</p>
          <ul class="voting-relay-list">${relayList}</ul>
          <p class="voting-consent-muted">${t("voting.consentPrivacy")}</p>
          <p class="voting-consent-muted">${t("voting.consentIdentity")}</p>
          <button class="voting-consent-accept">${t("voting.consentAccept")}</button>
        </div>
      </div></div>
    </div>`
}

const INVITE_ICON = '<svg class="voting-room-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14a4.5 4.5 0 019 0"/><path d="M12 5v4M14 7h-4"/></svg>'
const PENCIL_ICON = '<svg class="voting-room-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M11 2l3 3L5.5 13.5H2.5v-3z"/></svg>'
const CHECK_PATH = '<path d="M3 8l4 4 6-7"/>'
const CHECK_ICON = `<svg class="voting-room-item-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${CHECK_PATH}</svg>`
const CHEVRON_SM = '<svg class="voting-room-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>'

function renderRoomBar(activeRoom: PrivateRoom | null, roomListOpen: boolean): string {
  const roomName = activeRoom ? escapeHtml(activeRoom.name) : escapeHtml(t("voting.defaultRoom"))
  const action = roomListOpen ? "close-room-list" : "open-room-list"
  const openClass = roomListOpen ? " voting-room-current-open" : ""

  const actionBtns = activeRoom
    ? `<button class="voting-room-rename" data-room-id="${escapeHtml(activeRoom.id)}" title="${escapeHtml(t("voting.renameRoom"))}">${PENCIL_ICON}</button><button class="voting-room-share" title="${escapeHtml(t("voting.shareRoom"))}">${INVITE_ICON}</button>`
    : ""

  return `<div class="voting-room-bar"><button class="voting-room-current${openClass}" data-action="${action}"><span class="voting-room-current-name">${roomName}</span>${CHEVRON_SM}</button>${actionBtns}</div>`
}

function renderRoomListPanel(activeRoom: PrivateRoom | null, knownRooms: readonly PrivateRoom[], confirmLeaveRoomId: string | null): string {
  const defaultActive = activeRoom === null ? " voting-room-item-active" : ""
  const defaultCheck = activeRoom === null ? CHECK_ICON : ""
  const defaultRow = `<button class="voting-listbox-row voting-room-item${defaultActive}" data-room-id=""><span class="voting-room-item-check-wrap">${defaultCheck}</span><span class="voting-room-item-name">${escapeHtml(t("voting.defaultRoom"))}</span><span class="voting-room-item-badge">${escapeHtml(t("voting.defaultRoomBadge"))}</span></button>`

  const roomRows = knownRooms.map((r) => {
    if (r.id === confirmLeaveRoomId) {
      return `<div class="voting-listbox-row voting-room-item voting-room-item-confirm"><span>${escapeHtml(t("voting.leaveConfirm", { room: r.name }))}</span><button class="voting-room-confirm-yes" data-room-id="${escapeHtml(r.id)}">${escapeHtml(t("voting.leaveConfirmYes"))}</button><button class="voting-room-confirm-no">${escapeHtml(t("voting.leaveConfirmNo"))}</button></div>`

    }
    const active = activeRoom?.id === r.id ? " voting-room-item-active" : ""
    const check = activeRoom?.id === r.id ? CHECK_ICON : ""
    return `<div class="voting-listbox-row voting-room-item${active}"><button class="voting-room-item-select" data-room-id="${escapeHtml(r.id)}"><span class="voting-room-item-check-wrap">${check}</span><span class="voting-room-item-name">${escapeHtml(r.name)}</span></button><button class="voting-room-item-leave" data-room-id="${escapeHtml(r.id)}" title="${escapeHtml(t("voting.leaveRoom"))}">&times;</button></div>`
  }).join("")

  const createRow = `<button class="voting-listbox-row voting-room-item-create" data-action="create-room"><span class="voting-room-item-icon">+</span><span>${escapeHtml(t("voting.createNewRoom"))}</span></button>`

  return `<div class="voting-listbox voting-room-list">${defaultRow}${roomRows}${createRow}</div>`
}

export function renderVotingCard(params: VotingCardParams): string {
  const { userAvatar, restaurants, isReadOnly, relayStatus, collapsed, activeRoom, knownRooms, roomListOpen, confirmLeaveRoomId, joinedViaUrl } = params
  const sorted = [...restaurants].sort((a, b) => b.voteCount - a.voteCount)

  let collapsedSummary = ""
  if (collapsed) {
    const voterPubkeys = new Set<string>()
    for (const r of sorted) for (const v of r.voters) voterPubkeys.add(v.pubkey)
    const totalVoters = voterPubkeys.size
    const leading = sorted.length > 0 && sorted[0].voteCount > 0 ? sorted[0].name : null
    collapsedSummary = renderVotingCardCollapsed({ totalVoters, leadingRestaurant: leading })
  }
  const rows = sorted.map((r) => renderVoteRow(r, isReadOnly)).join("")

  let connectedCount = 0
  const relayListItems: string[] = []
  for (const [url, connected] of relayStatus) {
    if (connected) connectedCount++
    const cls = connected ? "voting-relay-ok" : "voting-relay-off"
    const dot = connected ? "&#x25CF;" : "&#x25CB;"
    relayListItems.push(`<li class="${cls}">${dot} ${escapeHtml(url)}</li>`)
  }

  const relayStatusText = connectedCount > 0
    ? `<span class="voting-relay-status">${t("voting.relayStatus", { count: String(connectedCount) })}</span>`
    : `<span class="voting-relay-status voting-relay-disconnected">${t("voting.relayDisconnected")}</span>`

  const pastClass = isReadOnly ? " voting-past" : ""
  const collapsedClass = collapsed ? " collapsed" : ""
  const highlightClass = joinedViaUrl ? " voting-highlight" : ""

  const contentInner = roomListOpen
    ? renderRoomListPanel(activeRoom, knownRooms, confirmLeaveRoomId)
    : `<div class="voting-body">
          ${isReadOnly ? `<div class="voting-ended">${t("voting.pastDay")}</div>` : ""}
          <div class="voting-listbox">${rows}</div>
          <div class="voting-footer voting-info-toggle">
            ${relayStatusText}
            <span class="voting-powered">${t("voting.poweredBy")} &#9432;</span>
          </div>
          <div class="voting-info-panel" hidden>
            <ul class="voting-relay-list">${relayListItems.join("")}</ul>
            <p>${t("voting.privacyInfo")}</p>
            <a href="https://nostr.com" target="_blank" rel="noopener">${t("voting.learnMore")} &rarr;</a>
          </div>
        </div>`

  return `
    <div class="restaurant-card voting-card visible settled${pastClass}${collapsedClass}${highlightClass}">
      <div class="restaurant-header">
        <div class="restaurant-header-top">
          <div class="restaurant-name">${t("voting.cardTitle")}</div>
          <div class="restaurant-header-actions">
            <button class="collapse-btn" aria-label="${escapeHtml(t("card.collapse"))}">${SVG.chevron}</button>
          </div>
        </div>
        <div class="voting-identity-row">
          <span class="voting-identity-prefix">${t("voting.iAm")}</span>
          ${renderIdentityBadge(userAvatar)}
        </div>
      </div>
      ${renderRoomBar(activeRoom, roomListOpen)}
      ${roomListOpen ? "" : `<div class="voting-collapsed-summary">${collapsedSummary}</div>`}
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${contentInner}
      </div></div>
    </div>`
}
