import { useState } from 'react'
import { useSearchParams } from 'react-router'

import type { LocationReference } from '@/lib/location'

import { useCountries } from '../api/use-geography'
import { LocationPicker } from './location-picker'

type LocationFilterFieldsProps = { idPrefix: string }

export function LocationFilterFields({ idPrefix }: LocationFilterFieldsProps) {
  const [params] = useSearchParams()
  // Recreate only the draft location when history restores a different filter URL.
  return <LocationFilterDraft key={params.toString()} idPrefix={idPrefix} params={params} />
}

function LocationFilterDraft({ idPrefix, params }: LocationFilterFieldsProps & { params: URLSearchParams }) {
  const countries = useCountries()
  const initialCity = params.get('city') ?? ''
  const [draft, setDraft] = useState({
    countryCode: (params.get('country') ?? (initialCity ? 'ME' : '')).toUpperCase(),
    cityId: Number(params.get('cityId')) || null,
    cityName: initialCity,
    region: params.get('region') || null,
  })
  const country = countries.data?.find((item) => item.isoCode === draft.countryCode)
  // This restores a filter reference from its URL, not a validated event-form selection.
  // Country identity comes from the API; forms only receive actual suggestion objects.
  const value: LocationReference | null =
    country && draft.cityId && draft.cityName
      ? {
          cityId: draft.cityId,
          cityName: draft.cityName,
          countryId: country.id,
          countryIsoCode: country.isoCode,
          countryName: country.name,
          administrativeDivision: draft.region,
          admin1Code: null,
          admin2Code: null,
        }
      : null
  return (
    <div className="min-w-0 sm:col-span-2">
      <LocationPicker
        idPrefix={idPrefix}
        countryCode={draft.countryCode}
        value={value}
        allCountries
        compact
        required={false}
        legacyCity={draft.cityId ? undefined : draft.cityName}
        onCountryChange={(countryCode) => setDraft({ countryCode, cityId: null, cityName: '', region: null })}
        onChange={(location) =>
          setDraft((current) => ({
            ...current,
            cityId: location?.cityId ?? null,
            cityName: location?.cityName ?? '',
            region: location?.administrativeDivision ?? null,
          }))
        }
      />
      {draft.countryCode && <input type="hidden" name="country" value={draft.countryCode} />}
      {draft.cityId && <input type="hidden" name="cityId" value={draft.cityId} />}
      {draft.cityName && <input type="hidden" name="city" value={draft.cityName} />}
      {draft.region && <input type="hidden" name="region" value={draft.region} />}
    </div>
  )
}
