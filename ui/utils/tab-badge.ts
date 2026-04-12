declare global {
  interface Navigator {
    setAppBadge?(contents?: number): Promise<void>
    clearAppBadge?(): Promise<void>
  }
}

const BADGE_PREFIX = "\u2022 "

let _baseTitle = ""
let _hasNew = false
let _listenerAdded = false

export function initTabBadge(baseTitle: string): void {
  _baseTitle = baseTitle
  if (_listenerAdded) return
  _listenerAdded = true

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && _hasNew) {
      _hasNew = false
      document.title = _baseTitle
      navigator.clearAppBadge?.()
    }
  })
}

export function onVoteReceived(isForToday: boolean, isOwnEcho: boolean): void {
  if (!isForToday || isOwnEcho || !document.hidden) return
  if (_hasNew) return

  _hasNew = true
  document.title = BADGE_PREFIX + _baseTitle
  navigator.setAppBadge?.()
}
