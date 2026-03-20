import { DAYS } from "../constants"

interface OverlayConfig {
  id: string
  emoji: string
  title: string
  text: string
  browseDay: string
}

function renderOfflineState(
  contentEl: HTMLElement,
  cfg: OverlayConfig,
  onBrowse: (day: string) => void
): void {
  const carousel = document.getElementById("carousel")
  if (carousel) carousel.style.display = "none"
  const btnId = `${cfg.id}-browse`
  contentEl.insertAdjacentHTML(
    "afterbegin",
    `<div class="weekend-state" id="${cfg.id}">
      <div class="weekend-emoji">${cfg.emoji}</div>
      <div class="weekend-title">${cfg.title}</div>
      <div class="weekend-text">${cfg.text}</div>
      <button class="weekend-browse-btn" id="${btnId}">Menüs der letzten Woche ansehen</button>
    </div>`
  )
  document.getElementById(btnId)!.addEventListener("click", function (this: HTMLElement) {
    this.closest(".weekend-state")!.remove()
    onBrowse(cfg.browseDay)
  })
}

export function renderWeekendState(
  contentEl: HTMLElement,
  onBrowse: (day: string) => void
): void {
  renderOfflineState(
    contentEl,
    {
      id: "weekend-state",
      emoji: "\u{1F373}\u{1F372}\u{1F957}",
      title: "Guten Appetit... am Montag!",
      text: "Am Wochenende haben die Kantinen Pause.<br>Die Menüs für nächste Woche werden am Montag früh aktualisiert.",
      browseDay: DAYS.at(-1)!,
    },
    onBrowse
  )
}

export function renderStaleDataState(
  contentEl: HTMLElement,
  activeDay: string,
  onBrowse: (day: string) => void
): void {
  renderOfflineState(
    contentEl,
    {
      id: "stale-state",
      emoji: "\u{1F504}",
      title: "Neue Menüs noch nicht verfügbar",
      text: "Die Menüs für diese Woche wurden noch nicht veröffentlicht.<br>Schau später nochmal vorbei!",
      browseDay: activeDay,
    },
    onBrowse
  )
}
