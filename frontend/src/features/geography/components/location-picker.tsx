import { Label } from '@/components/ui/label'
import type { Ref } from 'react'
import type { LocationReference } from '@/lib/location'

import { useCountries } from '../api/use-geography'
import { CityCombobox } from './city-combobox'
import { CountrySelector } from './country-selector'

type LocationPickerProps = {
  idPrefix: string
  countryCode: string
  value: LocationReference | null
  onCountryChange: (code: string) => void
  onChange: (value: LocationReference | null) => void
  disabled?: boolean
  error?: string
  legacyCity?: string
  required?: boolean
  allCountries?: boolean
  compact?: boolean
  inputRef?: Ref<HTMLInputElement>
  onBlur?: () => void
  onQueryChange?: (query: string) => void
}

export function LocationPicker({
  idPrefix,
  countryCode,
  value,
  onCountryChange,
  onChange,
  disabled = false,
  error,
  legacyCity,
  required = true,
  allCountries = false,
  compact = false,
  inputRef,
  onBlur,
  onQueryChange,
}: LocationPickerProps) {
  const countries = useCountries()
  const allowed = countries.data?.some((country) => country.isoCode === countryCode) ?? false
  const cityId = `${idPrefix}-city`
  const showHelp = !compact || Boolean(legacyCity && !value)
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <CountrySelector
        id={`${idPrefix}-country`}
        value={countryCode}
        disabled={disabled}
        required={required}
        allCountries={allCountries}
        onChange={(code) => {
          onChange(null)
          onCountryChange(code)
        }}
      />
      <div className="min-w-0 space-y-2">
        <Label htmlFor={cityId}>
          City or settlement{' '}
          {required && (
            <span aria-hidden="true" className="text-primary">
              *
            </span>
          )}
        </Label>
        <CityCombobox
          id={cityId}
          countryCode={countryCode}
          value={value}
          onChange={onChange}
          disabled={disabled || !allowed}
          error={error}
          required={required}
          inputRef={inputRef}
          onBlur={onBlur}
          onQueryChange={onQueryChange}
          initialQuery={legacyCity}
          describedBy={
            [showHelp ? `${cityId}-help` : '', error ? `${cityId}-error` : ''].filter(Boolean).join(' ') ||
            undefined
          }
        />
        {showHelp && (
          <p id={`${cityId}-help`} className="text-xs leading-relaxed text-muted-foreground">
            {legacyCity && !value
              ? 'Confirm the existing location by choosing a city from the suggestions.'
              : 'Choose a suggestion to confirm the city. Use arrow keys and Enter, or select a result.'}
          </p>
        )}
        {error && (
          <p id={`${cityId}-error`} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
