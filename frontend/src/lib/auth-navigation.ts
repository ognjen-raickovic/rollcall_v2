// Accept only same-app paths. Never send a demo login to an external URL or back to itself.
function hasUnsafeCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character === '\\' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
  )
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || hasUnsafeCharacters(value))
    return '/events'
  try {
    const target = new URL(value, 'https://rollcall.invalid')
    const pathname = decodeURIComponent(target.pathname)
    if (
      target.origin !== 'https://rollcall.invalid' ||
      pathname.startsWith('//') ||
      hasUnsafeCharacters(pathname) ||
      pathname.replace(/\/+$/, '').toLowerCase() === '/login'
    )
      return '/events'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/events'
  }
}

export function loginPath(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
