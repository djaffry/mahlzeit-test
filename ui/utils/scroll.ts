const SCROLL_PADDING_PX = 12
const HIGHLIGHT_DURATION_MS = 2000

let _headerEl: HTMLElement | null = null

export function smoothScrollTo(el: HTMLElement): void {
  _headerEl ??= document.querySelector(".header") as HTMLElement | null
  const headerOffset = _headerEl?.offsetHeight ?? 0
  const stickyHeader = el.closest(".day-section.expanded")?.querySelector(".day-header") as HTMLElement | null
  const stickyOffset = stickyHeader && !el.classList.contains("day-header") ? stickyHeader.offsetHeight : 0
  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset - stickyOffset - SCROLL_PADDING_PX
  window.scrollTo({ top, behavior: "smooth" })
}

let _highlightedEl: HTMLElement | null = null

export function flashAndScroll(el: HTMLElement, extraClass?: string): void {
  if (_highlightedEl) {
    _highlightedEl.classList.remove("highlighted")
    if (_highlightedEl.dataset.flashExtra) {
      _highlightedEl.classList.remove(_highlightedEl.dataset.flashExtra)
      delete _highlightedEl.dataset.flashExtra
    }
  }
  el.classList.add("highlighted")
  if (extraClass) {
    el.classList.add(extraClass)
    el.dataset.flashExtra = extraClass
  }
  _highlightedEl = el
  smoothScrollTo(el)
  setTimeout(() => {
    el.classList.remove("highlighted")
    if (extraClass) el.classList.remove(extraClass)
    delete el.dataset.flashExtra
    if (_highlightedEl === el) _highlightedEl = null
  }, HIGHLIGHT_DURATION_MS)
}

/* ── Persistent highlight (stays until manually cleared) ── */

let _persistentEl: HTMLElement | null = null
let _persistentClass: string | null = null
let _persistentClickHandler: (() => void) | null = null

export function persistentHighlight(el: HTMLElement, extraClass: string): void {
  clearPersistentHighlight()
  el.classList.add(extraClass)
  _persistentEl = el
  _persistentClass = extraClass
  _persistentClickHandler = () => clearPersistentHighlight()
  el.addEventListener("click", _persistentClickHandler, { once: true })
  smoothScrollTo(el)
}

export function clearPersistentHighlight(): void {
  if (!_persistentEl) return
  if (_persistentClass) _persistentEl.classList.remove(_persistentClass)
  if (_persistentClickHandler) {
    _persistentEl.removeEventListener("click", _persistentClickHandler)
    _persistentClickHandler = null
  }
  _persistentEl = null
  _persistentClass = null
}
