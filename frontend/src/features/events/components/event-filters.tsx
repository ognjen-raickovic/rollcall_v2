import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Form, Link, useSearchParams } from 'react-router'
import { useState, useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormSelect } from '@/components/form-select'
import { SELECTABLE_EVENT_TAGS } from '../event-tags'
import { SORT_LABELS } from '../event-discovery-filters'
import { GAME_CATEGORY_LABELS } from '@/lib/game-categories'

type EventFiltersProps = {
  params: URLSearchParams
  locationFilters: ReactNode
  games: { id: number; name: string }[]
  pending: boolean
}
export function EventFilters({ params, locationFilters, games, pending }: EventFiltersProps) {
  const [, setParams] = useSearchParams(),
    value = (key: string) => params.get(key) ?? ''
  const zone = value('timeZone') || Intl.DateTimeFormat().resolvedOptions().timeZone
  const advanced =
    ['from', 'to', 'timeFrom', 'timeTo', 'category', 'tags', 'experience', 'maxMinimumAge'].some((key) =>
      Boolean(value(key)),
    ) || Boolean(value('period') && value('period') !== 'upcoming')
  const active = [...params.keys()].filter(
    (key) => !['city', 'region', 'limit', 'timeZone', 'sort'].includes(key) && Boolean(value(key)),
  ).length
  const [expanded, setExpanded] = useState(advanced)
  const panelId = useId()
  return (
    <Form
      key={params.toString()}
      action="/events"
      method="get"
      role="search"
      aria-label="Filter gaming events"
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4 md:p-6 [&_label]:min-h-4"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget),
          next = new URLSearchParams()
        for (const [key, entry] of data)
          if (key !== 'tags' && typeof entry === 'string' && entry !== '') next.set(key, entry)
        const tags = data.getAll('tags').filter((entry): entry is string => typeof entry === 'string')
        if (tags.length) next.set('tags', tags.join(','))
        for (const [key, defaultValue] of [
          ['availability', 'all'],
          ['period', 'upcoming'],
          ['sort', 'soonest'],
        ])
          if (next.get(key) === defaultValue) next.delete(key)
        if (!next.get('timeFrom') && !next.get('timeTo')) next.delete('timeZone')
        setParams(next)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          Find your table{' '}
          {active > 0 && (
            <span className="text-xs text-muted-foreground">· {active} active filters</span>
          )}
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link to="/events">
            <X aria-hidden="true" />
            Reset filters
          </Link>
        </Button>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="event-search">Search events</Label>
          <Input
            id="event-search"
            name="search"
            defaultValue={value('search')}
            maxLength={100}
            placeholder="D&D, Commander, Catan..."
            className="h-11 bg-background"
          />
        </div>
        {locationFilters}
        <div className="min-w-0 space-y-2">
          <Label htmlFor="event-game">Game</Label>
          <FormSelect id="event-game" name="gameId" defaultValue={value('gameId')} disabled={pending}>
            <option value="">{pending ? 'Loading games…' : 'All games'}</option>
            {value('gameId') && !games.some((game) => String(game.id) === value('gameId')) && (
              <option value={value('gameId')}>Unavailable game</option>
            )}
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </FormSelect>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="event-availability">Availability</Label>
          <FormSelect
            id="event-availability"
            name="availability"
            defaultValue={value('availability') || (value('availableOnly') === 'true' ? 'open' : 'all')}
          >
            <option value="all">Any availability</option>
            <option value="open">Open seats</option>
            <option value="full">Full tables</option>
          </FormSelect>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          More filters
        </button>
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows] duration-250 ease-in-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          inert={!expanded}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="event-from">Start date from</Label>
                <Input
                  id="event-from"
                  name="from"
                  type="date"
                  defaultValue={value('from')}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-to">Start date to</Label>
                <Input id="event-to" name="to" type="date" defaultValue={value('to')} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-period">Event timing</Label>
                <FormSelect id="event-period" name="period" defaultValue={value('period') || 'upcoming'}>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Finished</option>
                  <option value="all">Any scheduled event</option>
                </FormSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time-from">Start time from</Label>
                <Input
                  id="event-time-from"
                  name="timeFrom"
                  type="time"
                  defaultValue={value('timeFrom')}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time-to">Start time to</Label>
                <Input
                  id="event-time-to"
                  name="timeTo"
                  type="time"
                  defaultValue={value('timeTo')}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-experience">Recommended experience</Label>
                <FormSelect id="event-experience" name="experience" defaultValue={value('experience')}>
                  <option value="">Any experience</option>
                  <option value="all-levels">All-levels events only</option>
                  <option value="intermediate-plus">Intermediate+ events only</option>
                  <option value="veteran-plus">Veteran+ events only</option>
                  <option value="beginner">Beginner or all levels (legacy)</option>
                  <option value="experienced">Experienced or all levels (legacy)</option>
                </FormSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-age">Advertised minimum age at most</Label>
                <Input
                  id="event-age"
                  name="maxMinimumAge"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={value('maxMinimumAge')}
                  placeholder="Any age requirement"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-category">Game category</Label>
                <FormSelect id="event-category" name="category" defaultValue={value('category')}>
                  <option value="">All categories</option>
                  {Object.entries(GAME_CATEGORY_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </FormSelect>
              </div>
            </div>
            <input type="hidden" name="timeZone" value={zone} />
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Dates include both selected days in your browser timezone. Time filters match event start
              times, including the selected minute, in {zone}; overnight ranges are not supported.
              Experience includes all-levels tables where stated. Age is an event requirement, not your
              private age.
            </p>
            <fieldset className="mt-4 space-y-3">
              <legend className="text-sm font-medium">Tags · match all selected (up to six)</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SELECTABLE_EVENT_TAGS.map((tag) => (
                  <label key={tag} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag}
                      defaultChecked={value('tags').split(',').includes(tag)}
                      className="mt-1 accent-primary"
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full space-y-2 sm:w-52">
          <Label htmlFor="event-sort">Sort by</Label>
          <FormSelect id="event-sort" name="sort" defaultValue={value('sort') || 'soonest'}>
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </FormSelect>
        </div>
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
          <Search aria-hidden="true" />
          Search
        </Button>
      </div>
    </Form>
  )
}
