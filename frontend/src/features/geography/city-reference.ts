import type { LocationReference } from '@/lib/location'

import type { City } from './types'

export function cityReference(city: City): LocationReference {
  return {
    cityId: city.id,
    countryId: city.countryId,
    countryIsoCode: city.countryIsoCode,
    countryName: city.countryName,
    cityName: city.name,
    administrativeDivision: city.administrativeDivision,
    admin1Code: city.admin1Code,
    admin2Code: city.admin2Code,
  }
}
