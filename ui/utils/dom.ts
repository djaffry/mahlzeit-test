let _escapeEl: HTMLSpanElement | null = null

export function escapeHtml(str: string): string {
  _escapeEl ??= document.createElement("span")
  _escapeEl.textContent = str
  return _escapeEl.innerHTML
}

export function smoothScrollTo(el: HTMLElement): void {
  const toolbarOffset = (document.querySelector(".toolbar") as HTMLElement)?.offsetHeight ?? 0
  const top = el.getBoundingClientRect().top + window.scrollY - toolbarOffset - 12
  window.scrollTo({ top, behavior: "smooth" })
}

export function highlightMatch(html: string, query: string): string {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
  return html.replace(regex, "<mark>$1</mark>")
}

export function isOverlayOpen(): boolean {
  return (
    document.getElementById("search-overlay")?.hidden === false ||
    document.getElementById("map-overlay")?.hidden === false
  )
}

let _reduceMotionMq: MediaQueryList | null = null
export function prefersReducedMotion(): boolean {
  _reduceMotionMq ??= window.matchMedia("(prefers-reduced-motion: reduce)")
  return _reduceMotionMq.matches
}
