export type Theme = 'dark' | 'light'
const THEME_KEY = 'rollcall.theme'
const THEME_EVENT = 'rollcall:theme'

export function getTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
    ? 'light'
    : 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  const background = getComputedStyle(root).getPropertyValue('--background').trim()
  if (background) meta?.setAttribute('content', background)
}

export function setTheme(theme: Theme) {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* Keep the current theme in memory if storage is blocked. */
  }
  window.dispatchEvent(new Event(THEME_EVENT))
}

export function subscribeTheme(listener: () => void): () => void {
  function storage(event: StorageEvent) {
    if (event.key !== THEME_KEY && event.key !== null) return
    let theme: Theme = 'dark'
    try {
      if (localStorage.getItem(THEME_KEY) === 'light') theme = 'light'
    } catch {
      return
    }
    applyTheme(theme)
    listener()
  }
  window.addEventListener(THEME_EVENT, listener)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(THEME_EVENT, listener)
    window.removeEventListener('storage', storage)
  }
}
