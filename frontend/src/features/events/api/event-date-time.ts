export function localDateTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

export function isoDateTime(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return ''
  const date = new Date(local)
  // Reject impossible dates and local times skipped by daylight-saving transitions.
  return Number.isFinite(date.getTime()) && localDateTime(date.toISOString()) === local
    ? date.toISOString()
    : ''
}
