import type { LocationReference } from '@/lib/location'
import { useCountries } from '../api/use-geography'
import { LocationPicker } from './location-picker'

type ProfileLocationPickerProps = {
  countryId: number | null
  value: LocationReference | null
  onCountryChange: (countryId: number | null) => void
  onChange: (value: LocationReference | null) => void
  onQueryChange: (query: string) => void
  disabled?: boolean
  error?: string
}

export function ProfileLocationPicker({
  countryId,
  value,
  onCountryChange,
  ...props
}: ProfileLocationPickerProps) {
  const countries = useCountries()
  const country = countries.data?.find((item) => item.id === countryId)
  return (
    <LocationPicker
      {...props}
      idPrefix="profile-location"
      required={false}
      countryCode={country?.isoCode ?? value?.countryIsoCode ?? ''}
      value={value}
      onCountryChange={(code) =>
        onCountryChange(countries.data?.find((item) => item.isoCode === code)?.id ?? null)
      }
    />
  )
}
