import { eventDiscoveryFiltersSchema, type EventDiscoveryFilters } from './api/event-dtos'

export const SORT_LABELS = {
  soonest: 'Soonest first',
  latest: 'Latest first',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
} as const
export function localDayBoundary(value: string, nextDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return null
  const date = new Date(0)
  date.setHours(0, 0, 0, 0)
  date.setFullYear(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}
export function discoveryFromUrl(params: URLSearchParams): {
  filters: EventDiscoveryFilters
  error?: string
} {
  const allowed = [
    'search',
    'country',
    'city',
    'cityId',
    'region',
    'gameId',
    'category',
    'availableOnly',
    'limit',
    'from',
    'to',
    'timeFrom',
    'timeTo',
    'timeZone',
    'sort',
    'period',
    'availability',
    'tags',
    'experience',
    'maxMinimumAge',
  ]
  const bad = () => ({
    filters: {},
    error: 'Choose valid filters. Date and time ranges must run from earlier to later.',
  })
  if ([...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1))
    return bad()
  for (const key of ['cityId', 'gameId', 'limit'])
    if (params.get(key) && !/^[1-9]\d*$/.test(params.get(key) ?? '')) return bad()
  if (params.get('city') && !params.get('cityId')) return bad()
  if (params.get('availableOnly') && !['true', 'false'].includes(params.get('availableOnly') ?? ''))
    return bad()
  const from = params.get('from') || undefined,
    to = params.get('to') || undefined
  const after = from ? localDayBoundary(from) : undefined,
    before = to ? localDayBoundary(to, true) : undefined
  if ((from && !after) || (to && !before) || (from && to && from > to)) return bad()
  const timeFrom = params.get('timeFrom') || undefined,
    timeTo = params.get('timeTo') || undefined
  const timeZone =
    timeFrom || timeTo
      ? params.get('timeZone') || Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined
  try {
    if (timeZone) new Intl.DateTimeFormat('en', { timeZone }).format()
  } catch {
    return bad()
  }
  if (timeFrom && timeTo && timeFrom > timeTo) return bad()
  const age = params.get('maxMinimumAge')
  if (age && !/^\d{1,2}$/.test(age)) return bad()
  const parsed = eventDiscoveryFiltersSchema.safeParse({
    search: params.get('search') || undefined,
    country: params.get('country') || undefined,
    cityId: params.get('cityId') ? Number(params.get('cityId')) : undefined,
    gameId: params.get('gameId') ? Number(params.get('gameId')) : undefined,
    category: params.get('category') || undefined,
    availableOnly: params.get('availableOnly') === 'true',
    upcomingOnly: true,
    status: 'scheduled',
    startsAfter: after || undefined,
    startsBefore: before || undefined,
    startsBeforeExclusive: before ? true : undefined,
    timeFrom,
    timeTo,
    timeZone,
    sort: params.get('sort') || undefined,
    period: params.get('period') || undefined,
    availability: params.get('availability') || undefined,
    tags: params.get('tags') ? params.get('tags')?.split(',') : undefined,
    experience: params.get('experience') || undefined,
    maxMinimumAge: age ? Number(age) : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : 12,
  })
  return parsed.success ? { filters: parsed.data } : bad()
}
