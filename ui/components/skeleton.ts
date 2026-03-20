export function renderSkeleton(container: HTMLElement): void {
  const randLines = (): string => {
    const count = 8 + Math.floor(Math.random() * 32)
    return Array.from({ length: count }, () => {
      const w = 25 + Math.floor(Math.random() * 65)
      return `<div class="skeleton-line" style="width:${w}%"></div>`
    }).join("")
  }

  container.innerHTML =
    '<div class="carousel"><div class="carousel-track"><div class="day-panel"><div class="restaurant-grid">' +
    [1, 2, 3].map(() => `<div class="skeleton-card">${randLines()}</div>`).join("") +
    "</div></div></div></div>"
}
