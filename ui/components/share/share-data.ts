import { getWeekDates, dateToIso } from "../../utils/date"
import type { ShareTag, ShareSection, ShareDayGroup, ShareSelectionData } from "./share-types"

export function extractRestaurantMeta(cardElement: HTMLElement): { name: string; cuisine: string; badges: string[] } | null {
  const nameElement = cardElement.querySelector('.restaurant-name')
  if (!nameElement) return null
  const name = nameElement.textContent?.trim() || ''
  const cuisine = cardElement.dataset.cuisine || ''
  const badges = cardElement.dataset.badges ? cardElement.dataset.badges.split(',') : []
  return { name, cuisine, badges }
}

export function extractMenuItem(element: HTMLElement): { title: string; price: string; description: string; tags: ShareTag[] } {
  const tagPills = element.querySelectorAll<HTMLElement>('.tag-pill')
  const tags: ShareTag[] = [...tagPills].map(el => ({
    label: el.textContent?.trim() || '',
    color: getComputedStyle(el).color,
  })).filter(t => t.label)
  return {
    title:       element.querySelector('.menu-item-title')?.textContent?.trim() || '',
    price:       element.querySelector('.menu-item-price')?.textContent?.trim() || '',
    description: element.querySelector('.menu-item-description')?.textContent?.trim() || '',
    tags,
  }
}

export function groupItemsByCategory(
  itemElements: HTMLElement[],
): { name: string; items: { title: string; price: string; description: string; tags: ShareTag[] }[] }[] {
  const categoryMap = new Map<string, { title: string; price: string; description: string; tags: ShareTag[] }[]>()
  for (const element of itemElements) {
    const categoryElement = element.closest('.menu-category')
    const categoryName = categoryElement?.querySelector('.category-name')?.textContent?.trim() || ''
    if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, [])
    categoryMap.get(categoryName)!.push(extractMenuItem(element))
  }
  return [...categoryMap.entries()].map(([name, items]) => ({ name, items }))
}

export function getShareSelectionData(getTimeline: () => HTMLElement | null): ShareSelectionData | null {
  const timeline = getTimeline()
  if (!timeline) return null

  const days: ShareDayGroup[] = []
  const weekDates = getWeekDates()

  for (const daySection of timeline.querySelectorAll<HTMLElement>('.day-section')) {
    const dayIndex = Number(daySection.dataset.dayIndex ?? -1)
    const dateForIndex = dayIndex >= 0 && dayIndex < weekDates.length ? weekDates[dayIndex] : null
    const dateIso = dateForIndex ? dateToIso(dateForIndex) : ''

    const sections: ShareSection[] = []
    for (const card of daySection.querySelectorAll<HTMLElement>('.restaurant-section')) {
      const selectedItems = [...card.querySelectorAll<HTMLElement>('.menu-item.selected:not(.hidden)')]
      if (selectedItems.length === 0) continue

      const meta = extractRestaurantMeta(card)
      if (!meta) continue

      sections.push({
        ...meta,
        icon: card.querySelector('.restaurant-icon')?.getAttribute('data-icon') ?? undefined,
        restaurant: card.dataset.restaurantId ?? '',
        categories: groupItemsByCategory(selectedItems),
      })
    }

    if (sections.length > 0) {
      days.push({ day: dateIso, sections })
    }
  }

  if (days.length === 0) return null
  return { days }
}
