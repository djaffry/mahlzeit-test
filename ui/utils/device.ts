import { DESKTOP_MIN_WIDTH } from "../constants"

export function isDesktop(): boolean {
  return window.innerWidth >= DESKTOP_MIN_WIDTH
}

let _reduceMotionMq: MediaQueryList | null = null
export function prefersReducedMotion(): boolean {
  _reduceMotionMq ??= window.matchMedia("(prefers-reduced-motion: reduce)")
  return _reduceMotionMq.matches
}
