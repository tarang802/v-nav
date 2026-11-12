/**
 * Builds popup content with DOM nodes and textContent only, so names and other
 * user-supplied text can never be interpreted as HTML.
 */
export function popupContent(title, lines = []) {
  const root = document.createElement('div')
  root.className = 'vnav-popup'
  const h = document.createElement('div')
  h.className = 'vnav-popup-title'
  h.textContent = title
  root.appendChild(h)
  for (const line of lines) {
    const p = document.createElement('div')
    p.className = 'vnav-popup-line'
    p.textContent = line
    root.appendChild(p)
  }
  return root
}
