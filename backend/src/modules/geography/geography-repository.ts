import type { DatabaseClient } from '../../db/supabase.js'
import { dependencyUnavailable } from '../../shared/api-error.js'
import { cityRowsSchema, countryRowsSchema } from './geography-schema.js'
import type { GeographyRepository } from './types.js'

export function createGeographyRepository(client: DatabaseClient): GeographyRepository {
  return {
    async listCountries() {
      try {
        const { data, error } = await client
          .from('countries')
          .select('id,iso_code,name')
          .eq('enabled', true)
          .order('name')
          .order('id')
          .retry(false)
        if (error) throw dependencyUnavailable()
        return countryRowsSchema
          .parse(data)
          .map((row) => ({ id: row.id, isoCode: row.iso_code, name: row.name }))
      } catch {
        throw dependencyUnavailable()
      }
    },
    async searchCities(input) {
      try {
        const { data, error } = await client
          .rpc('search_cities', {
            country_code: input.country,
            search_query: input.q,
            result_limit: input.limit,
          })
          .retry(false)
        if (error) throw dependencyUnavailable()
        return cityRowsSchema.parse(data).map((row) => ({
          id: row.id,
          countryId: row.country_id,
          countryIsoCode: row.country_iso_code,
          countryName: row.country_name,
          name: row.name,
          administrativeDivision: row.administrative_division,
          admin1Code: row.admin1_code,
          admin2Code: row.admin2_code,
          latitude: row.latitude,
          longitude: row.longitude,
        }))
      } catch {
        throw dependencyUnavailable()
      }
    },
  }
}
