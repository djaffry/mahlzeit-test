import "./shortcuts-modal.css"
import { escapeHtml } from "../../utils/dom"
import { t } from "../../i18n/i18n"
import { icons } from "../../icons"
import { openOverlay } from "../overlay/overlay"

export function showShortcutsModal(): void {
  const { panel, close } = openOverlay({
    minWidth: "320px",
    onLangChange: () => render(),
  })

  function render(): void {
    const sections: { label: string; rows: [string, string][] }[] = [
      {
        label: t("shortcuts.sectionGeneral"),
        rows: [
          ["/", t("shortcuts.search")],
          ["Escape", t("shortcuts.escape")],
          ["1 – 5", t("shortcuts.days")],
          ["D", t("shortcuts.randomPick")],
          ["F", t("shortcuts.filters")],
          ["V", t("shortcuts.votingRooms")],
          ["L", t("shortcuts.language")],
          ["M", t("shortcuts.map")],
          ["T", t("shortcuts.theme")],
          ["?", t("shortcuts.showShortcuts")],
        ],
      },
      {
        label: t("shortcuts.sectionSelection"),
        rows: [
          ["P", t("shortcuts.shareImage")],
          ["C", t("shortcuts.shareText")],
        ],
      },
    ]

    const tableHtml = sections.map(({ label, rows }) => {
      const rowsHtml = rows.map(([key, desc]) =>
        `<tr><td class="shortcuts-keys"><kbd>${key}</kbd></td><td class="shortcuts-desc">${escapeHtml(desc)}</td></tr>`
      ).join("")
      return `<tbody class="shortcuts-section"><tr><th colspan="2">${escapeHtml(label)}</th></tr>${rowsHtml}</tbody>`
    }).join("")

    panel.innerHTML = `
      <div class="overlay-header">
        <span class="overlay-title">${escapeHtml(t("shortcuts.title"))}</span>
        <button class="icon-btn" id="shortcuts-close">${icons.x}</button>
      </div>
      <table class="shortcuts-table">
        ${tableHtml}
      </table>
    `

    panel.querySelector("#shortcuts-close")?.addEventListener("click", close)
  }

  render()
}
