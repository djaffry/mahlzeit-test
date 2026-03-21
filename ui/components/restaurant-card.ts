import { escapeHtml } from "../utils/dom"
import { isAvailableOnDay } from "../utils/date"
import { SVG } from "../constants"
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

function renderRestaurantHeader(restaurant: Restaurant, suffix = ""): string {
  return `
    <div class="restaurant-header">
      <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(" · ")}</span>` : ""}${restaurant.stampCard ? `<span class="stamp-card-badge">${t('badge.stampCard')}</span>` : ""}${restaurant.edenred ? `<span class="edenred-badge">${t('badge.edenred')}</span>` : ""}${restaurant.outdoor ? `<span class="outdoor-badge">${t('badge.outdoor')}</span>` : ""}${restaurant.reservationUrl ? `<span class="reservation-badge">${t('badge.reservationRequired')}</span>` : ""}${suffix}</div>
      <div class="restaurant-header-actions">
        ${restaurant.coordinates ? `<button class="map-pin-link" aria-label="${t('map.showOnMap')}" title="${t('map.showOnMap')}">${SVG.mapPin}</button>` : ""}
        ${SVG.collapse}
      </div>
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
        <div class="restaurant-name">${t('map.cardTitle')}</div>
        <div class="restaurant-header-actions">
          <button class="map-card-btn map-fullscreen-btn" aria-label="${t('map.fullscreen')}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg></button>
          <svg class="map-card-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
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
