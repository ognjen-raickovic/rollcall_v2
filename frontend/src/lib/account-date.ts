// Full account dates use UTC, independent of the viewer's timezone; event dates do not.
export function formatAccountDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value
  return `${part('day')}. ${part('month')} ${part('year')}.`
}
