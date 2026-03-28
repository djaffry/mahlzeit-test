import { escapeHtml } from "../utils/dom"
import { isAvailableOnDay } from "../utils/date"
import { SVG, BADGES } from "../constants"
import { renderItem } from "./menu-item"
import { t } from '../i18n/i18n'
import type { Restaurant, MenuCategory } from "../types"

function renderCategories(categories: MenuCategory[]): string {
  return categories
    .map(
      (cat) => `
    <div class="category">
      <div class="category-title">${escapeHtml(cat.name)}</div>
      ${cat.items.map(renderItem).join("")}
    </div>`
    )
    .join("")
}

function renderBadges(restaurant: Restaurant, suffix = ""): string {
  const html = [
    restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(" · ")}</span>` : "",
    ...BADGES.filter(b => restaurant[b.prop]).map(b => `<span class="${b.css}">${t(b.i18n)}</span>`),
    suffix,
  ].join("")
  return html ? `<div class="restaurant-badges">${html}</div>` : ""
}

function renderRestaurantHeader(restaurant: Restaurant, suffix = ""): string {
  return `
    <div class="restaurant-header">
      <div class="restaurant-header-top">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}</div>
        <div class="restaurant-header-actions">
          <button class="select-all-btn" aria-label="${t('card.selectAll')}">${SVG.selectAll}</button>
          ${restaurant.coordinates ? `<button class="map-pin-link" aria-label="${t('map.showOnMap')}" title="${t('map.showOnMap')}">${SVG.mapPin}</button>` : ""}
          <button class="collapse-btn" aria-label="${t('card.collapse')}">${SVG.chevron}</button>
        </div>
      </div>
      ${renderBadges(restaurant, suffix)}
    </div>`
}

function renderRestaurantLinks(restaurant: Restaurant): string {
  return restaurant.reservationUrl
    ? `<div class="link-body"><a class="link-cta" href="${escapeHtml(restaurant.reservationUrl)}" target="_blank" rel="noopener">${t('card.reserveOnline')} &rarr;</a></div>`
    : ""
}

export function renderRestaurant(
  restaurant: Restaurant,
  day: string,
  collapsedSet: Set<string>
): string {
  const dayData = restaurant.days[day]
  const hasError = !!restaurant.error
  const hasData = dayData && dayData.categories && dayData.categories.length > 0

  let body = ""
  if (hasError) {
    body = `<div class="restaurant-error">${escapeHtml(restaurant.error!)}</div>`
  }
  if (hasData) {
    body += `<div class="restaurant-body">${renderCategories(dayData.categories)}</div>`
  } else if (!hasError) {
    body += `<div class="no-data">${t('card.noMenu')}</div>`
  }

  const linkText =
    restaurant.type === "specials"
      ? t('card.specialsLink')
      : t('card.websiteLink')
  const websiteLink = restaurant.url
    ? `<a class="link-cta" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">${linkText} &rarr;</a>`
    : ""

  return `
    <div class="restaurant-card${collapsedSet.has(restaurant.id) ? " collapsed" : ""}" data-restaurant="${escapeHtml(restaurant.id)}">
      ${renderRestaurantHeader(restaurant)}
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${body}
        <div class="link-body">${websiteLink}</div>
        ${renderRestaurantLinks(restaurant)}
      </div></div>
    </div>`
}

export function renderLinkRestaurant(
  restaurant: Restaurant,
  day: string,
  collapsedSet: Set<string>
): string {
  const available = isAvailableOnDay(restaurant, day)
  const schedule =
    !available && restaurant.availableDays
      ? `<span class="link-schedule">${t('map.onlyDays', { days: restaurant.availableDays.map((d) => t('dayShort.' + d)).join(", ") })}</span>`
      : ""
  const websiteLink = restaurant.url
    ? `<a class="link-cta" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">${t('card.linkWebsite')} &rarr;</a>`
    : ""

  return `
    <div class="restaurant-card${!available ? " link-muted" : ""}${collapsedSet.has(restaurant.id) ? " collapsed" : ""}" data-restaurant="${escapeHtml(restaurant.id)}">
      ${renderRestaurantHeader(restaurant, schedule)}
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="link-body">${websiteLink}</div>
        ${renderRestaurantLinks(restaurant)}
      </div></div>
    </div>`
}

export function renderMapCardInGrid(mapCollapsed: boolean): string {
  return `
    <div class="restaurant-card map-card visible settled${mapCollapsed ? " map-collapsed" : ""}">
      <div class="restaurant-header">
        <div class="restaurant-header-top">
          <div class="restaurant-name">${t('map.cardTitle')}</div>
          <div class="restaurant-header-actions">
            <button class="map-card-btn map-fullscreen-btn" aria-label="${t('map.fullscreen')}">${SVG.fullscreen}</button>
            <button class="collapse-btn" aria-label="${t('card.collapse')}">${SVG.chevron}</button>
          </div>
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="map-slot"></div>
      </div></div>
    </div>`
}

export function renderDay(
  menuRestaurants: Restaurant[],
  linkRestaurants: Restaurant[],
  day: string,
  collapsedSet: Set<string>,
  mapCollapsed: boolean
): string {
  const cards =
    menuRestaurants.map((r) => renderRestaurant(r, day, collapsedSet)).join("") +
    linkRestaurants.map((r) => renderLinkRestaurant(r, day, collapsedSet)).join("")
  return `<div class="restaurant-grid">${renderMapCardInGrid(mapCollapsed)}${cards}</div>`
}

export function revealCards(panel: HTMLElement, instant = false): void {
  const cards = panel.querySelectorAll<HTMLElement>(".restaurant-card:not(.visible)")
  if (cards.length === 0) return
  if (instant) {
    cards.forEach((card) => card.classList.add("visible", "settled"))
    return
  }
  const settleTime = cards.length * 25 + 200
  cards.forEach((card, i) => {
    card.style.transitionDelay = `${i * 25}ms`
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("visible")))
  })
  setTimeout(() => {
    cards.forEach((card) => {
      card.style.transitionDelay = ""
      card.classList.add("settled")
    })
  }, settleTime)
}
