// Deliberately narrow, hand-maintained geography contract, not a generated full DB schema.
// Replace with reviewed CLI-generated types when authenticated modules are integrated.
export type CountryRow = {
  id: number
  iso_code: string
  name: string
  enabled: boolean
  created_at: string
}

export type CityRow = {
  id: number
  country_id: number
  country_iso_code: string
  country_name: string
  name: string
  normalized_name: string
  administrative_division: string | null
  admin1_code: string | null
  admin2_code: string | null
  latitude: number | null
  longitude: number | null
  population: number | null
  external_source_id: string | null
}

export type Database = {
  public: {
    Tables: {
      countries: {
        Row: CountryRow
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      search_cities: {
        Args: { country_code: string; search_query: string; result_limit: number }
        Returns: CityRow[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
