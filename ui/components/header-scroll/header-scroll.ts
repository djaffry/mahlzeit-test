const SCROLL_THRESHOLD = 10

export function setupHeaderScroll(): void {
  const header = document.getElementById("header")
  if (!header) return

  let ticking = false
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        header.classList.toggle("scrolled", window.scrollY > SCROLL_THRESHOLD)
        ticking = false
      })
      ticking = true
    }
  }, { passive: true })
}
