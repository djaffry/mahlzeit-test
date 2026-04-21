import { flashAndScroll } from "../../utils/dom"
import { todayIso } from "../../utils/today"
import { isoToWeekdayIndex } from "../../utils/date"

export function handleDeepLink(deps: { expandDay: (index: number) => void }): void {
  const urlParams = new URLSearchParams(window.location.search)
  const deepLinkRestaurant = urlParams.get('r')
  const deepLinkDay = urlParams.get('d')

  if (deepLinkDay != null || deepLinkRestaurant) {
    const dayIdx = deepLinkDay != null ? Number(deepLinkDay) : isoToWeekdayIndex(todayIso())
    if (!isNaN(dayIdx) && dayIdx >= 0 && dayIdx < 5) {
      deps.expandDay(dayIdx)
      if (deepLinkRestaurant) {
        requestAnimationFrame(() => {
          const section = document.getElementById(`r-${dayIdx}-${deepLinkRestaurant}`)
          if (section) flashAndScroll(section)
        })
      }
    }
    const cleanUrl = window.location.origin + window.location.pathname
    window.history.replaceState({}, '', cleanUrl)
  }
}
