import { escapeHtml } from "../utils/dom"
import { renderTags } from "../utils/tag-utils"

export function renderItem(item: {
  title: string
  description: string | null
  price: string | null
  tags: string[]
  allergens: string | null
}): string {
  const tagsData = (item.tags || []).map((t) => t.toLowerCase()).join(" ")
  const tags = renderTags(item.tags || [])
  const price = item.price ? ` <span class="item-price">${escapeHtml(item.price)}</span>` : ""
  const desc = item.description
    ? `<div class="item-description">${escapeHtml(item.description)}</div>`
    : ""
  const allergens = item.allergens
    ? `<span class="allergens">(${escapeHtml(item.allergens)})</span>`
    : ""
  const meta = [tags, allergens].filter(Boolean).join(" ")

  return `
    <div class="menu-item" data-tags="${escapeHtml(tagsData)}">
      <div class="item-title"><span class="item-title-text">${escapeHtml(item.title)}</span>${price}</div>
      ${desc}
      ${meta ? `<div class="item-meta">${meta}</div>` : ""}
    </div>`
}
