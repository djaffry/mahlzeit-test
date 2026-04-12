let _escapeEl: HTMLSpanElement | null = null

export function escapeHtml(str: string): string {
  _escapeEl ??= document.createElement("span")
  _escapeEl.textContent = str
  return _escapeEl.innerHTML
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text)
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return escapeHtml(text)
  return `${escapeHtml(text.slice(0, idx))}<span class="search-highlight">${escapeHtml(text.slice(idx, idx + query.length))}</span>${escapeHtml(text.slice(idx + query.length))}`
}
