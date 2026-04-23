import "./timeline.css"
import type { Restaurant } from "../../types"
import type { VoteMapEntry } from "../../voting/types"
import { t } from "../../i18n/i18n"
import { icons, restaurantIconSpan } from "../../icons"
import { formatDayHeader, dateToIso, todayIndexInWeek } from "../../utils/date"
import { todayIso } from "../../utils/today"
import { smoothScrollTo, escapeHtml } from "../../utils/dom"
import { renderRestaurantSection, renderVoterDots } from "../restaurant-section/restaurant-section"
import { sortWithFavorites, isFavorite, toggleFavorite } from "../favorites/favorites"
import { haptic } from "../../utils/haptic"

export interface TimelineOptions {
  restaurants: Restaurant[]
  weekDates: Date[]
  getVotes: (dayIndex: number) => Map<string, VoteMapEntry>
  getFilters: () => Set<string> | null
  onVote: (restaurantId: string, dayIndex: number) => void
  onDayRender?: () => void
}

interface DayState {
  expanded: boolean
  dateIso: string
  date: Date
  restaurants: Restaurant[]
}

const _state: {
  el: HTMLElement | null
  days: DayState[]
  getVotes: (i: number) => Map<string, VoteMapEntry>
  getFilters: () => Set<string> | null
  onVote: ((rid: string, di: number) => void) | null
  onDayRender: (() => void) | null
  listenerAttached: boolean
  initialScrollDone: boolean
} = {
  el: null,
  days: [],
  getVotes: () => new Map(),
  getFilters: () => null,
  onVote: null,
  onDayRender: null,
  listenerAttached: false,
  initialScrollDone: false,
}

const MAX_LEADER_PILLS = 3

function computeTodayIdx(): number {
  return todayIndexInWeek(_state.days.map(d => d.date), todayIso())
}

function renderLeaderPills(dayIndex: number, precomputed?: Map<string, VoteMapEntry>): string {
  if (!_state.days[dayIndex]) return ""
  const day = _state.days[dayIndex]

  const dayVotes = precomputed ?? _state.getVotes(dayIndex)
  const ranked: { name: string; icon: string | undefined; count: number }[] = []
  for (const r of day.restaurants) {
    const vote = dayVotes.get(r.id)
    if (vote && vote.count > 0) {
      ranked.push({ name: r.title, icon: r.icon, count: vote.count })
    }
  }

  ranked.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const top = ranked.slice(0, MAX_LEADER_PILLS)
  if (top.length === 0) return ""

  const ordinalKeys = ["voting.ordinal1", "voting.ordinal2", "voting.ordinal3"]
  return top.map((entry, i) => {
    const cls = i === 0 ? "leader-pill leader-pill-1st" : "leader-pill"
    const crown = i === 0 ? `<span class="leader-pill-crown">${icons.crown}</span>` : ""
    const iconHtml = `<span class="leader-pill-icon">${restaurantIconSpan(entry.icon)}</span>`
    return `<span class="${cls}">${crown}<span class="leader-pill-ord">${escapeHtml(t(ordinalKeys[i]))}</span>${iconHtml}<span class="leader-pill-name">${escapeHtml(entry.name)}</span></span>`
  }).join("")
}

export function renderTimeline(el: HTMLElement, opts: TimelineOptions): void {
  _state.el = el
  _state.getVotes = opts.getVotes
  _state.getFilters = opts.getFilters
  _state.onVote = opts.onVote
  if (opts.onDayRender) _state.onDayRender = opts.onDayRender

  if (opts.weekDates.length !== 5) {
    console.warn(`[timeline] expected 5 weekDates, got ${opts.weekDates.length}`)
  }

  const prevDays = _state.days
  _state.days = opts.weekDates.map((date, i) => ({
    expanded: prevDays[i]?.expanded ?? false,
    dateIso: dateToIso(date),
    date,
    restaurants: opts.restaurants,
  }))

  const todayIdx = computeTodayIdx()
  if (prevDays.length === 0) {
    // First render: expand today if it's in the week, otherwise Monday.
    const defaultIdx = todayIdx >= 0 ? todayIdx : 0
    if (_state.days[defaultIdx]) _state.days[defaultIdx].expanded = true
  }

  if (!_state.listenerAttached) {
    setupListeners()
    if (!document.getElementById("day-announcer")) {
      const announcer = document.createElement("div")
      announcer.id = "day-announcer"
      announcer.className = "sr-only"
      announcer.setAttribute("aria-live", "polite")
      el.before(announcer)
    }
    _state.listenerAttached = true
  }

  renderShell(todayIdx)
}

function announceDay(dayIndex: number): void {
  const announcer = document.getElementById("day-announcer")
  if (announcer && _state.days[dayIndex]) {
    announcer.textContent = formatDayHeader(_state.days[dayIndex].date)
  }
}

function renderShell(todayIdx: number = computeTodayIdx()): void {
  if (!_state.el) return

  const html = _state.days.map((day, i) => {
    const isPast = todayIdx >= 0 && i < todayIdx
    const isToday = i === todayIdx
    const expandedClass = day.expanded ? " expanded" : ""
    const pastClass = isPast ? " past" : ""
    const todayLabel = isToday
      ? `<span class="day-header-today">${escapeHtml(t("app.today") ?? "TODAY")}</span>`
      : ""

    return `
      <div class="day-section${expandedClass}${pastClass}" id="day-${i}" data-day-index="${i}">
        <div class="day-header" data-day-index="${i}">
          <div class="day-header-left">
            <span class="day-header-chevron">${icons.chevronRight}</span>
            <span class="day-header-label">${escapeHtml(formatDayHeader(day.date))}</span>
            ${todayLabel}
          </div>
          <span class="day-header-count"></span>
        </div>
        <div class="day-content"></div>
      </div>`
  }).join("")

  _state.el.innerHTML = html

  _state.days.forEach((day, i) => {
    if (day.expanded) renderDay(i)
    else {
      const countEl = _state.el?.querySelector(`.day-section[data-day-index="${i}"] .day-header-count`) as HTMLElement | null
      if (countEl) countEl.innerHTML = renderLeaderPills(i)
    }
  })

  if (!_state.initialScrollDone && todayIdx >= 0) {
    _state.initialScrollDone = true
    const todaySection = _state.el.querySelector(`.day-section[data-day-index="${todayIdx}"]`) as HTMLElement | null
    if (todaySection) {
      requestAnimationFrame(() => smoothScrollTo(todaySection))
    }
  }
}

function renderDay(index: number): void {
  if (!_state.el || !_state.days[index]) return
  const day = _state.days[index]

  const daySection = _state.el.querySelector(`.day-section[data-day-index="${index}"]`)
  const contentEl = daySection?.querySelector(".day-content") as HTMLElement | null
  if (!contentEl) return

  const countEl = daySection?.querySelector(".day-header-count") as HTMLElement | null
  const dayVotes = _state.getVotes(index)

  if (countEl) countEl.innerHTML = renderLeaderPills(index, dayVotes)

  if (!day.expanded) {
    contentEl.innerHTML = ""
    return
  }
  const filters = _state.getFilters()
  const sorted = sortWithFavorites(day.restaurants)
  let pinnedCount = 0
  let totalCount = 0
  let lastPinnedIdx = -1

  const sectionStrings = sorted.map((r, i) => {
    const pinned = isFavorite(r.id)
    const menu = r.days?.[day.dateIso]
    const vote = dayVotes.get(r.id) ?? { count: 0, userVoted: false, voters: [] }
    const html = renderRestaurantSection({ restaurant: r, dayMenu: menu, voteCount: vote.count, userVoted: vote.userVoted, voters: vote.voters, dayIndex: index, dateIso: day.dateIso, filters, isPinned: pinned })
    if (html) {
      totalCount++
      if (pinned) { pinnedCount++; lastPinnedIdx = i }
    }
    return html
  })

  if (pinnedCount > 0 && pinnedCount < totalCount) {
    sectionStrings.splice(lastPinnedIdx + 1, 0, `<div class="pinned-divider">${escapeHtml(t("favorites.others"))}</div>`)
  }

  const sections = sectionStrings.join("")
  contentEl.innerHTML = `<div class="day-restaurants">${sections}</div>`
  _state.onDayRender?.()
}

function setupListeners(): void {
  if (!_state.el) return

  _state.el.addEventListener("click", (e) => {
    const target = e.target as HTMLElement

    const dayHeader = target.closest(".day-header") as HTMLElement | null
    if (dayHeader) {
      const idx = Number(dayHeader.dataset.dayIndex)
      if (!isNaN(idx) && _state.days[idx]) {
        const wasExpanded = _state.days[idx].expanded
        _state.days[idx].expanded = !wasExpanded
        const daySection = _state.el?.querySelector(`.day-section[data-day-index="${idx}"]`)
        daySection?.classList.toggle("expanded", !wasExpanded)
        renderDay(idx)
        if (!wasExpanded) announceDay(idx)
      }
      return
    }

    const voteBtn = target.closest(".vote-btn") as HTMLElement | null
    if (voteBtn) {
      const restaurantId = voteBtn.dataset.voteId
      const daySection = voteBtn.closest(".day-section") as HTMLElement | null
      const dayIndex = daySection ? Number(daySection.dataset.dayIndex) : -1
      if (restaurantId && _state.onVote && dayIndex >= 0) {
        _state.onVote(restaurantId, dayIndex)
      }
      return
    }

    const pinBtn = target.closest(".pin-btn") as HTMLElement | null
    if (pinBtn) {
      const restaurantId = pinBtn.dataset.pinId
      if (restaurantId) {
        haptic()
        toggleFavorite(restaurantId)
        rerenderExpandedDays()
      }
      return
    }

    const menuItem = target.closest(".menu-item") as HTMLElement | null
    if (menuItem) {
      menuItem.classList.toggle("expanded")
      return
    }
  })
}

export function expandDay(index: number, opts?: { scroll?: boolean }): void {
  const { scroll = true } = opts ?? {}
  if (_state.days[index] && !_state.days[index].expanded) {
    _state.days[index].expanded = true
    const daySection = _state.el?.querySelector(`.day-section[data-day-index="${index}"]`)
    daySection?.classList.add("expanded")
    renderDay(index)
    announceDay(index)
  }
  if (scroll) {
    const section = _state.el?.querySelector(`.day-section[data-day-index="${index}"]`) as HTMLElement | null
    if (section) smoothScrollTo(section)
  }
}

export function collapseAllExceptToday(): void {
  const todayIdx = computeTodayIdx()
  _state.days.forEach((day, i) => {
    const wasExpanded = day.expanded
    day.expanded = i === todayIdx
    if (wasExpanded !== day.expanded) {
      const daySection = _state.el?.querySelector(`.day-section[data-day-index="${i}"]`)
      daySection?.classList.toggle("expanded", day.expanded)
      renderDay(i)
    }
  })
}

export function rerenderExpandedDays(): void {
  _state.days.forEach((day, i) => {
    if (day.expanded) renderDay(i)
  })
}

export function updateVotes(): void {
  if (!_state.el) return

  _state.days.forEach((day, i) => {
    const dayVotes = _state.getVotes(i)

    const countEl = _state.el?.querySelector(`.day-section[data-day-index="${i}"] .day-header-count`) as HTMLElement | null
    if (countEl) countEl.innerHTML = renderLeaderPills(i, dayVotes)

    if (!day.expanded) return
    const daySection = _state.el?.querySelector(`.day-section[data-day-index="${i}"]`)
    if (!daySection) return

    for (const btn of daySection.querySelectorAll<HTMLElement>(".vote-btn")) {
      const rid = btn.dataset.voteId
      if (!rid) continue
      const vote = dayVotes.get(rid)
      const count = vote?.count ?? 0
      const voted = vote?.userVoted ?? false
      const voters = vote?.voters ?? []

      btn.classList.toggle("voted", voted)
      btn.classList.toggle("vote-active", count > 0)

      const countSpan = btn.querySelector(".vote-count")
      if (count > 0) {
        if (countSpan) {
          countSpan.textContent = String(count)
        } else {
          const span = document.createElement("span")
          span.className = "vote-count"
          span.textContent = String(count)
          btn.querySelector(".vote-check")?.after(span)
        }
      } else {
        countSpan?.remove()
      }

      const dotsSpan = btn.querySelector(".voter-dots")
      if (voters.length > 0) {
        const newDotsHtml = renderVoterDots(voters)
        if (dotsSpan) {
          dotsSpan.outerHTML = newDotsHtml
        } else {
          btn.insertAdjacentHTML("beforeend", newDotsHtml)
        }
      } else {
        dotsSpan?.remove()
      }
    }
  })
}
