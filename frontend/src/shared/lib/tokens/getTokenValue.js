export function getTokenValue(name, element = document.documentElement) {
  if (!name || !element) return ''

  return getComputedStyle(element).getPropertyValue(name).trim()
}
