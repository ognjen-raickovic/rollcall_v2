import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FormSelect } from '@/components/form-select'

import { useCountries } from '../api/use-geography'

type CountrySelectorProps = {
  id: string
  value: string
  onChange: (countryCode: string) => void
  disabled?: boolean
  required?: boolean
  allCountries?: boolean
}

export function CountrySelector({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  allCountries = false,
}: CountrySelectorProps) {
  const countries = useCountries()
  const description = `${id}-status`
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>
        Country{' '}
        {required && (
          <span aria-hidden="true" className="text-primary">
            *
          </span>
        )}
      </Label>
      <FormSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || countries.isPending || Boolean(countries.error) || !countries.data?.length}
        aria-describedby={description}
        aria-required={required}
      >
        <option value="">
          {countries.isPending ? 'Loading countries...' : allCountries ? 'All countries' : 'Select a country'}
        </option>
        {countries.data?.map((country) => (
          <option key={country.id} value={country.isoCode}>
            {country.name}
          </option>
        ))}
      </FormSelect>
      <div id={description}>
        {countries.error ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>Countries couldn’t be loaded. Start the location service or try again.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={countries.isFetching}
              onClick={() => void countries.refetch()}
            >
              Retry countries
            </Button>
          </div>
        ) : countries.isPending ? (
          <p role="status" className="text-xs text-muted-foreground">
            Loading available countries...
          </p>
        ) : !countries.data?.length ? (
          <p role="status" className="text-sm text-muted-foreground">
            No countries are available right now.
          </p>
        ) : null}
      </div>
    </div>
  )
}
