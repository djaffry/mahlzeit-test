import "./footer.css"
import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { formatDateTime } from "../../utils/date"

export function renderFooter(latest: string | null, footerEl: HTMLElement): void {
  const pageLoadTime = formatDateTime(new Date())
  const fetchTime = latest ? formatDateTime(new Date(latest)) : null
  const times = fetchTime
    ? `${escapeHtml(t("footer.loaded", { time: pageLoadTime }))}<br>${escapeHtml(t("footer.fetched", { time: fetchTime }))}`
    : escapeHtml(t("footer.loaded", { time: pageLoadTime }))
  footerEl.innerHTML = times
}
