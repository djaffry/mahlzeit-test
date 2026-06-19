import "./sidebar-toc.css"
import type { Restaurant } from "../../types"
import { t } from "../../i18n/i18n"
import { isAvailableOnDay, formatDayHeader, todayIndexInWeek, dateToIso } from "../../utils/date"
import { todayIso } from "../../app-config"
import { getRestaurantIcon } from "../../icons"
import { escapeHtml, smoothScrollTo } from "../../utils/dom"
import { sortWithFavorites, isFavorite } from "../favorites/favorites"
import { isPinsOnly, VIEW_MODE_CHANGE_EVENT } from "../favorites/view-mode"

const _state = {
  expandDay: (() => {}) as (index: number) => void,
  tocEl: null as HTMLElement | null,
  observer: null as IntersectionObserver | null,
  viewport: null as HTMLElement | null,
  lastTop: -1,
  lastBottom: -1,
  dayChildren: new Map<number, HTMLElement[]>(),
}

export function createSidebarToc(weekDates: Date[], deps: { expandDay: (index: number) => void }): HTMLElement {
  _state.expandDay = deps.expandDay
  const nav = document.createElement("nav")
  nav.className = "sidebar-toc"
  if (isPinsOnly()) nav.classList.add("toc-pins-only")
  nav.id = "sidebar-toc"
  _state.tocEl = nav
  _state.lastTop = -1
  _state.lastBottom = -1
  _state.dayChildren.clear()

  // Listen for view-mode changes (from header button or keyboard)
  document.addEventListener(VIEW_MODE_CHANGE_EVENT, () => {
    nav.classList.toggle("toc-pins-only", isPinsOnly())
    updateViewportHighlight()
  })

  const todayIdx = todayIndexInWeek(weekDates, todayIso())

  for (let i = 0; i < weekDates.length; i++) {
    const date = weekDates[i]
    const dayLabel = formatDayHeader(date)
    const a = document.createElement("a")
    a.href = `#day-${i}`
    a.className = i === todayIdx ? "sidebar-toc-day today" : "sidebar-toc-day"
    if (i === todayIdx) {
      a.innerHTML = `${escapeHtml(dayLabel)} <span class="sidebar-toc-today-badge">${escapeHtml(t("app.today"))}</span>`
    } else {
      a.textContent = dayLabel
    }
    a.dataset.dayIndex = String(i)
    nav.appendChild(a)
  }

  _state.viewport = document.createElement("div")
  _state.viewport.className = "toc-viewport"
  nav.appendChild(_state.viewport)

  nav.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a[href^='#']") as HTMLAnchorElement | null
    if (!link) return
    e.preventDefault()

    const dayIdx = link.dataset.dayIndex ?? link.dataset.tocDay
    if (dayIdx != null) _state.expandDay(Number(dayIdx))

    if (!link.dataset.dayIndex) {
      const href = link.getAttribute("href")
      const target = href ? document.querySelector(href) as HTMLElement | null : null
      if (target) smoothScrollTo(target)
    }
  })

  setupScrollSpy()
  requestAnimationFrame(() => {
    nav.classList.add("ready")
    const todayLink = nav.querySelector(".sidebar-toc-day.today") as HTMLElement | null
    if (todayLink) todayLink.scrollIntoView({ block: "center" })
  })
  return nav
}

export function updateTocRestaurants(dayIndex: number, restaurants: Restaurant[], dateIso: string): void {
  if (!_state.tocEl) return

  _state.tocEl.querySelectorAll(`[data-toc-day="${dayIndex}"]`).forEach((el) => el.remove())

  const dayLink = _state.tocEl.querySelector(`[data-day-index="${dayIndex}"]`)
  if (!dayLink) return

  const children: HTMLElement[] = []
  let insertAfter: Element = dayLink
  let lastPinnedEl: Element | null = null
  let pinnedCount = 0
  let totalCount = 0

  for (const r of sortWithFavorites(restaurants)) {
    const hasMenu = !!(r.days?.[dateIso]?.categories?.length)
    const isLink = r.type === "link" && isAvailableOnDay(r, dateIso)
    const pinned = isFavorite(r.id)
    if (!hasMenu && !isLink && !pinned) continue

    totalCount++
    if (pinned) pinnedCount++

    const a = document.createElement("a")
    a.href = `#r-${dayIndex}-${r.id}`
    a.dataset.tocDay = String(dayIndex)
    if (isLink && !hasMenu) a.className = "sidebar-toc-link-restaurant"
    if (pinned) a.classList.add("toc-pinned")
    const iconName = r.icon ?? ""
    const iconSvg = getRestaurantIcon(iconName)
    a.innerHTML = `<span class="toc-restaurant-icon" data-icon="${escapeHtml(iconName)}">${iconSvg}</span>${escapeHtml(r.title)}`
    insertAfter.after(a)
    insertAfter = a
    children.push(a)
    if (pinned) lastPinnedEl = a
  }

  // Insert a divider between pinned and unpinned entries
  if (pinnedCount > 0 && pinnedCount < totalCount && lastPinnedEl) {
    const divider = document.createElement("span")
    divider.className = "toc-pinned-divider"
    divider.dataset.tocDay = String(dayIndex)
    lastPinnedEl.after(divider)
  }

  _state.dayChildren.set(dayIndex, children)
}

function updateViewportHighlight(): void {
  if (!_state.tocEl || !_state.viewport) return
  const inView = _state.tocEl.querySelectorAll<HTMLElement>(".sidebar-toc-day.in-view")
  if (inView.length === 0) {
    if (_state.lastTop !== -1) {
      _state.viewport.style.opacity = "0"
      _state.lastTop = -1
      _state.lastBottom = -1
    }
    return
  }

  let top = Infinity
  let bottom = -Infinity

  for (const dayEl of inView) {
    const dayIdx = dayEl.dataset.dayIndex
    const elTop = dayEl.offsetTop
    if (elTop < top) top = elTop
    let elBottom = elTop + dayEl.offsetHeight
    if (dayIdx != null) {
      const children = _state.dayChildren.get(Number(dayIdx)) ?? []
      for (const child of children) {
        const childBottom = child.offsetTop + child.offsetHeight
        if (childBottom > elBottom) elBottom = childBottom
      }
    }
    if (elBottom > bottom) bottom = elBottom
  }

  if (top !== _state.lastTop || bottom !== _state.lastBottom) {
    _state.viewport.style.transform = `translateY(${top}px)`
    _state.viewport.style.height = `${bottom - top}px`
    _state.viewport.style.opacity = "1"
    _state.lastTop = top
    _state.lastBottom = bottom

    const navTop = _state.tocEl.scrollTop
    const navHeight = _state.tocEl.clientHeight
    if (top < navTop) {
      _state.tocEl.scrollTo({ top, behavior: "smooth" })
    } else if (bottom > navTop + navHeight) {
      _state.tocEl.scrollTo({ top: bottom - navHeight, behavior: "smooth" })
    }
  }
}

function setupScrollSpy(): void {
  if (_state.observer) _state.observer.disconnect()

  _state.observer = new IntersectionObserver(
    (entries) => {
      if (!_state.tocEl) return
      for (const entry of entries) {
        const id = entry.target.id
        if (!id) continue

        const tocLink = _state.tocEl.querySelector(`a[href="#${CSS.escape(id)}"]`)

        if (entry.isIntersecting) {
          tocLink?.classList.add("in-view")
        } else {
          tocLink?.classList.remove("in-view")
        }
      }
      updateViewportHighlight()
    },
    {
      rootMargin: "-64px 0px -40% 0px",
      threshold: 0,
    },
  )

  refreshObservedTargets()
}

export function updateTocLanguage(weekDates: Date[]): void {
  if (!_state.tocEl) return
  const todayIdx = todayIndexInWeek(weekDates, todayIso())

  for (let i = 0; i < weekDates.length; i++) {
    const dayLink = _state.tocEl.querySelector(`[data-day-index="${i}"]`) as HTMLElement | null
    if (!dayLink) continue
    const date = weekDates[i]
    const dayLabel = formatDayHeader(date)
    if (i === todayIdx) {
      dayLink.innerHTML = `${escapeHtml(dayLabel)} <span class="sidebar-toc-today-badge">${escapeHtml(t("app.today"))}</span>`
    } else {
      dayLink.textContent = dayLabel
    }
  }
}

export function refreshObservedTargets(): void {
  if (!_state.observer) return
  _state.observer.disconnect()

  document.querySelectorAll(".day-section[id]").forEach((el) => {
    _state.observer!.observe(el)
  })
}
