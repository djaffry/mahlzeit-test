import "./restaurant-section.css"
import "../favorites/favorites.css"
import type { Restaurant, DayMenu, Voter } from "../../types"
import { BADGES } from "../../constants"
import { icons, restaurantIconSpan } from "../../icons"
import { t } from "../../i18n/i18n"
import { escapeHtml } from "../../utils/dom"
import { isAvailableOnDay, formatAvailableDays } from "../../utils/date"
import { isArchiveMode } from "../../archive/archive"
import { renderItem } from "../menu-item/menu-item"
import { itemMatchesFilters } from "../filter-bar/filter-bar"

function renderBadges(restaurant: Restaurant): string {
  const parts: string[] = []

  if (restaurant.cuisine?.length) {
    parts.push(restaurant.cuisine.map((c) => escapeHtml(c)).join(" · "))
  }

  for (const badge of BADGES) {
    if (restaurant[badge.prop]) {
      parts.push(
        `<span class="restaurant-badge"><span class="restaurant-badge-dot" style="background:var(${badge.cssVar})"></span>${escapeHtml(t(badge.i18n))}</span>`
      )
    }
  }

  return parts.length
    ? `<div class="restaurant-meta">${parts.join(" · ")}</div>`
    : ""
}

function renderCategories(menu: DayMenu, filters: Set<string> | null): string {
  return menu.categories
    .map((cat, ci) => {
      const name = cat.name
        ? `<div class="category-name">${escapeHtml(cat.name)}</div>`
        : ""
      const itemsWithIdx = cat.items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => filters === null || itemMatchesFilters(item, filters))
      if (itemsWithIdx.length === 0) return ""
      const items = itemsWithIdx.map(({ item, idx }) => renderItem(item, ci, idx)).join("")
      return `<div class="menu-category">${name}${items}</div>`
    })
    .join("")
}

const MAX_VOTER_DOTS = 5

export function renderVoterDots(voters: Voter[]): string {
  if (voters.length === 0) return ""
  const visible = voters.slice(0, MAX_VOTER_DOTS)
  const overflow = voters.length - visible.length
  const dots = visible
    .map((v) => {
      const selfClass = v.isSelf ? " voter-dot-self" : ""
      return `<span class="voter-dot${selfClass}" style="--voter-color:${escapeHtml(v.color)}" title="${escapeHtml(v.label)}">${v.iconSvg}</span>`
    })
    .join("")
  const overflowStr = overflow > 0 ? `<span class="voter-dot-overflow">+${overflow}</span>` : ""
  return `<span class="voter-dots">${dots}${overflowStr}</span>`
}

export interface RenderSectionOptions {
  restaurant: Restaurant
  dayMenu: DayMenu | undefined
  voteCount: number
  userVoted: boolean
  voters?: Voter[]
  dayIndex?: number
  dateIso?: string
  filters?: Set<string> | null
  isPinned?: boolean
}

export function renderRestaurantSection(opts: RenderSectionOptions): string {
  const { restaurant, dayMenu, voteCount, userVoted, voters = [], dayIndex, dateIso, filters = null, isPinned = false } = opts
  const sectionId = dayIndex != null ? `r-${dayIndex}-${escapeHtml(restaurant.id)}` : `r-${escapeHtml(restaurant.id)}`
  const iconSvg = restaurantIconSpan(restaurant.icon)
  const available = !dateIso || isAvailableOnDay(restaurant, dateIso)

  const hasVotes = voteCount > 0
  const voteClass = [
    "vote-btn",
    userVoted ? "voted" : "",
    hasVotes ? "vote-active" : "",
  ].filter(Boolean).join(" ")
  const countStr = hasVotes ? `<span class="vote-count">${voteCount}</span>` : ""
  const voterDotsStr = renderVoterDots(voters)
  const mapBtn = restaurant.coordinates
    ? `<button class="icon-btn map-fly-btn" data-fly-id="${escapeHtml(restaurant.id)}" aria-label="${escapeHtml(t("map.showOnMap"))}" title="${escapeHtml(t("map.showOnMap"))}">${icons.mapPin}</button>`
    : ""
  const pinClass = isPinned ? "pin-btn pinned" : "pin-btn"
  const pinAriaLabel = isPinned
    ? `${escapeHtml(t("favorites.unpin"))} ${escapeHtml(restaurant.title)}`
    : `${escapeHtml(t("favorites.pin"))} ${escapeHtml(restaurant.title)}`
  const pinBtn = `<button class="${pinClass}" data-pin-id="${escapeHtml(restaurant.id)}" aria-label="${pinAriaLabel}">${icons.pin}</button>`
  const voteAriaLabel = hasVotes
    ? `${escapeHtml(t("voting.voteFor"))} ${escapeHtml(restaurant.title)}, ${voteCount} ${voteCount === 1 ? "vote" : "votes"}`
    : `${escapeHtml(t("voting.voteFor"))} ${escapeHtml(restaurant.title)}`
  const canVote = dayIndex != null && available && !isArchiveMode()
  const voteBtn = canVote
    ? `<button class="${voteClass}" data-vote-id="${escapeHtml(restaurant.id)}" aria-label="${voteAriaLabel}">
          <span class="vote-check">${icons.heart}</span>
          ${countStr}
          ${voterDotsStr}
        </button>`
    : ""

  const availabilityTag = restaurant.availableDays?.length
    ? `<span class="availability-tag">${escapeHtml(formatAvailableDays(restaurant.availableDays))}</span>`
    : ""

  if (!dayMenu) {
    const bottomLabel = restaurant.type === "link" ? t("card.menuOnWebsite") : t("card.noMenu")
    const unavailableClass = !available ? " restaurant-unavailable" : ""

    return `
    <section class="restaurant-section restaurant-link-card${unavailableClass}" id="${sectionId}" data-restaurant-id="${escapeHtml(restaurant.id)}">
      <div class="restaurant-header-row">
        <div>
          <span class="restaurant-name">${iconSvg}${escapeHtml(restaurant.title)}</span>
          ${availabilityTag}
        </div>
        <div class="restaurant-actions">
          ${mapBtn}
          ${pinBtn}
          ${voteBtn}
        </div>
      </div>
      ${renderBadges(restaurant)}
      ${renderBottomWebsiteLink(restaurant, bottomLabel)}
    </section>`
  }

  const categoriesHtml = renderCategories(dayMenu, filters)
  if (!categoriesHtml) return ""

  const cuisineAttr = restaurant.cuisine?.length
    ? ` data-cuisine="${escapeHtml(restaurant.cuisine.join(" · "))}"`
    : ""
  const badgeList = BADGES.filter(b => restaurant[b.prop]).map(b => b.i18n)
  const badgesAttr = badgeList.length
    ? ` data-badges="${escapeHtml(badgeList.join(","))}"`
    : ""

  return `
    <section class="restaurant-section" id="${sectionId}" data-restaurant-id="${escapeHtml(restaurant.id)}"${cuisineAttr}${badgesAttr}>
      <div class="restaurant-header-row">
        <div>
          <span class="restaurant-name">
            ${iconSvg}${escapeHtml(restaurant.title)}
          </span>
          ${availabilityTag}
        </div>
        <div class="restaurant-actions">
          ${mapBtn}
          ${pinBtn}
          ${voteBtn}
        </div>
      </div>
      ${renderBadges(restaurant)}
      ${categoriesHtml}
      ${renderBottomWebsiteLink(restaurant, t("card.menuOnWebsite"))}
    </section>`
}

function renderBottomWebsiteLink(restaurant: Restaurant, label: string): string {
  const safeLabel = escapeHtml(label)
  if (restaurant.url) {
    const ariaLabel = escapeHtml(`${label} – ${restaurant.title}`)
    return `<a class="restaurant-website-link-text" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener noreferrer" aria-label="${ariaLabel}"><span>${safeLabel}</span>${icons.externalLink}</a>`
  }
  return `<span class="restaurant-website-link-text">${safeLabel}</span>`
}
