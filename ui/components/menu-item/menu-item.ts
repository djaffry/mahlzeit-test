import type { MenuItem } from "../../types"
import { getTagColor } from "../../utils/tag-utils"
import { t } from "../../i18n/i18n"
import { escapeHtml } from "../../utils/dom"
import { icons } from "../../icons"

function renderTagPills(tags: string[]): string {
  if (!tags.length) return ""
  const pills = tags.map((tag) => {
    const cssVar = getTagColor(tag)
    const label = t(`tag.${tag}`) ?? tag
    return `<span class="tag-pill" style="--tag-color:var(${cssVar})">${escapeHtml(label)}</span>`
  }).join("")
  return `<span class="menu-item-tags">${pills}</span>`
}

export function renderItem(item: MenuItem, catIdx?: number, itemIdx?: number): string {
  const price = item.price ? `<span class="menu-item-price">${escapeHtml(item.price)}</span>` : ""
  const tags = renderTagPills(item.tags ?? [])
  const desc = item.description
    ? `<div class="menu-item-description">${escapeHtml(item.description)}</div>`
    : ""
  const allergens = item.allergens
    ? `<div class="menu-item-allergens">${escapeHtml(item.allergens)}</div>`
    : ""
  const dataTags = (item.tags ?? []).map((tag) => tag.toLowerCase()).join(" ")

  return `
    <div class="menu-item" data-tags="${escapeHtml(dataTags)}"${catIdx != null ? ` data-cat-idx="${catIdx}"` : ""}${itemIdx != null ? ` data-item-idx="${itemIdx}"` : ""}>
      <span class="menu-item-check">${icons.checkSmall}</span>
      <span class="menu-item-title">${escapeHtml(item.title)}</span>
      ${price ? `<span class="menu-item-end">${price}</span>` : ""}
      ${tags}
      ${desc}
      ${allergens}
    </div>`
}
