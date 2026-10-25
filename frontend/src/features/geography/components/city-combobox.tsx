import { useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LocationReference } from '@/lib/location'
import { cn } from '@/lib/utils'

import { cityReference } from '../city-reference'
import { useCitySearch } from '../api/use-geography'
import { useDebouncedValue } from '../hooks/use-debounced-value'
import type { City } from '../types'

type CityComboboxProps = {
  id: string
  countryCode: string
  value: LocationReference | null
  onChange: (value: LocationReference | null) => void
  disabled?: boolean
  error?: string
  describedBy?: string
  initialQuery?: string
  inputRef?: Ref<HTMLInputElement>
  required?: boolean
  onBlur?: () => void
  onQueryChange?: (query: string) => void
}

export function CityCombobox(props: CityComboboxProps) {
  return <CityComboboxInput key={props.countryCode} {...props} />
}

function CityComboboxInput({
  id,
  countryCode,
  value,
  onChange,
  disabled = false,
  error,
  describedBy,
  initialQuery = '',
  inputRef,
  required = false,
  onBlur,
  onQueryChange,
}: CityComboboxProps) {
  const container = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const [draft, setDraft] = useState({ cityId: value?.cityId ?? null, text: value?.cityName ?? initialQuery })
  const [query, setQuery] = useState(value ? '' : initialQuery.slice(0, 80))
  const [active, setActive] = useState(-1)
  const debounced = useDebouncedValue(query)
  const result = useCitySearch(countryCode, debounced, open && !disabled)
  const settling = query !== debounced
  const cities = settling || result.isFetching || result.error ? [] : (result.data ?? [])
  const blocked = disabled || !countryCode
  const text = draft.cityId === (value?.cityId ?? null) ? draft.text : (value?.cityName ?? '')
  const activeCity = cities[active]
  const listId = `${id}-suggestions`

  useEffect(() => {
    if (open && activeCity)
      document.getElementById(`${id}-option-${activeCity.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeCity, id])

  function openList() {
    const bounds = input.current?.getBoundingClientRect()
    const height = window.visualViewport?.height ?? window.innerHeight
    if (bounds) setAbove(height - bounds.bottom < 340 && bounds.top > height - bounds.bottom)
    setOpen(true)
  }

  function select(city: City) {
    const reference = cityReference(city)
    setDraft({ cityId: reference.cityId, text: reference.cityName })
    setQuery('')
    onChange(reference)
    onQueryChange?.('')
    setOpen(false)
    setActive(-1)
    input.current?.focus()
  }

  return (
    <div
      ref={container}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!container.current?.contains(event.relatedTarget)) {
          setOpen(false)
          onBlur?.()
        }
      }}
    >
      <div className="relative">
        <Input
          ref={(element) => {
            input.current = element
            if (typeof inputRef === 'function') inputRef(element)
            else if (inputRef) inputRef.current = element
          }}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !blocked}
          aria-controls={open && !blocked ? listId : undefined}
          aria-activedescendant={open && activeCity ? `${id}-option-${activeCity.id}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          aria-required={required}
          autoComplete="off"
          disabled={blocked}
          value={text}
          maxLength={80}
          placeholder={countryCode ? 'Search for a city or settlement' : 'Choose a country first'}
          className="h-11 bg-background pr-10"
          onFocus={() => {
            openList()
            setActive(-1)
          }}
          onClick={openList}
          onChange={(event) => {
            const next = event.target.value
            setDraft({ cityId: null, text: next })
            setQuery(next)
            setActive(-1)
            onChange(null)
            onQueryChange?.(next)
            openList()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              openList()
              const direction = event.key === 'ArrowDown' ? 1 : -1
              setActive((previous) =>
                cities.length
                  ? previous < 0
                    ? direction > 0
                      ? 0
                      : cities.length - 1
                    : (previous + direction + cities.length) % cities.length
                  : -1,
              )
            } else if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (activeCity) select(activeCity)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              setActive(-1)
            }
          }}
        />
        <ChevronDown
          className="pointer-events-none absolute top-3 right-3 size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      {value && !blocked && (
        <div className="mt-2 flex items-start justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-start gap-2">
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Selected: {value.cityName}
              {value.administrativeDivision ? ` · ${value.administrativeDivision}` : ''}
            </span>
          </span>
          <button
            type="button"
            aria-label="Clear selected city"
            disabled={disabled}
            className="shrink-0 rounded-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              onChange(null)
              onQueryChange?.('')
              setDraft({ cityId: null, text: '' })
              setQuery('')
              input.current?.focus()
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {open && !blocked && (
        <div
          className={cn(
            'absolute right-0 left-0 z-30 max-h-80 overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground',
            above ? 'bottom-full mb-2' : 'top-11 mt-2',
          )}
        >
          {settling || result.isPending || result.isFetching ? (
            <p role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading cities...
            </p>
          ) : result.error ? (
            <div role="alert" className="space-y-2 p-3 text-sm">
              <p className="text-destructive">Cities couldn’t be loaded. Please try again.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void result.refetch()
                  input.current?.focus()
                }}
              >
                Retry cities
              </Button>
            </div>
          ) : !cities.length ? (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              No cities match this search. Try another spelling.
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="City suggestions" className="space-y-1">
            {!settling &&
              !result.isFetching &&
              !result.error &&
              cities.map((city, index) => (
                <li key={city.id} role="presentation">
                  <button
                    type="button"
                    id={`${id}-option-${city.id}`}
                    tabIndex={-1}
                    role="option"
                    aria-selected={value?.cityId === city.id}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(city)}
                    className={cn(
                      'w-full cursor-pointer rounded-md px-3 py-3 text-left text-sm [overflow-wrap:anywhere]',
                      active === index && 'bg-accent text-accent-foreground',
                      value?.cityId === city.id && 'font-semibold',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{city.name}</span>
                      {value?.cityId === city.id && (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {city.administrativeDivision ?? city.countryName}
                      {city.administrativeDivision ? ` · ${city.countryName}` : ''}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Geographic data:{' '}
            <a
              href="https://www.geonames.org/"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              GeoNames
            </a>
            , CC BY 4.0.
          </p>
        </div>
      )}
    </div>
  )
}
