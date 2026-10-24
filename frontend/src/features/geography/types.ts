export type Country = { id: number; isoCode: string; name: string }

export type City = {
  id: number
  countryId: number
  countryIsoCode: string
  countryName: string
  name: string
  administrativeDivision: string | null
  admin1Code: string | null
  admin2Code: string | null
  latitude: number | null
  longitude: number | null
}
