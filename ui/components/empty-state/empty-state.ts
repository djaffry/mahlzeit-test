import "./empty-state.css"
import { t } from "../../i18n/i18n"
import { escapeHtml } from "../../utils/dom"

export function renderErrorState(message: string): string {
  return `
    <div class="empty-state">
      <div class="empty-state-title">${escapeHtml(message)}</div>
      <button class="consent-accept" data-action="reload">${escapeHtml(t("error.retry") ?? "Retry")}</button>
    </div>`
}

export function renderLoadingState(): string {
  const lines = Array.from({ length: 8 }, (_, i) => {
    const widths = ["skeleton-line-short", "skeleton-line-long", "skeleton-line-medium"]
    return `<div class="skeleton-line ${widths[i % 3]}"></div>`
  }).join("")

  return `<div class="skeleton">${lines}</div>`
}
