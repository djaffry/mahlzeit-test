import { flashAndScroll } from "../../utils/dom"
import { todayIso } from "../../utils/today"
import { isoToWeekdayIndex } from "../../utils/date"

export function handleDeepLink(deps: { expandDay: (index: number) => void }): void {
  const urlParams = new URLSearchParams(window.location.search)
  const deepLinkRestaurant = urlParams.get('r')
  const deepLinkDay = urlParams.get('d')

  if (deepLinkDay != null || deepLinkRestaurant) {
    const rawDayIdx = deepLinkDay != null ? Number(deepLinkDay) : isoToWeekdayIndex(todayIso())
    const dayIdx = !isNaN(rawDayIdx) && rawDayIdx >= 0 ? rawDayIdx : 0
    if (dayIdx < 5) {
      deps.expandDay(dayIdx)
      if (deepLinkRestaurant) {
        requestAnimationFrame(() => {
          const section = document.getElementById(`r-${dayIdx}-${deepLinkRestaurant}`)
          if (section) flashAndScroll(section)
        })
      }
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('r')
    url.searchParams.delete('d')
    window.history.replaceState({}, '', url.pathname + url.search)
  }
}
