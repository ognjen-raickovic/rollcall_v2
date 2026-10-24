import { z } from 'zod'

import { apiGet } from './http-client'

import type { City, Country } from '../types'

const id = z.number().int().min(1).max(2147483647)
const countrySchema = z.object({
  id,
  isoCode: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(2).max(100),
})
const citySchema = z.object({
  id,
  countryId: id,
  countryIsoCode: z.string().regex(/^[A-Z]{2}$/),
  countryName: z.string().min(2).max(100),
  name: z.string().min(1).max(200),
  administrativeDivision: z.string().max(200).nullable(),
  admin1Code: z.string().max(20).nullable(),
  admin2Code: z.string().max(80).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
})

export const geographyApi = {
  countries: (signal?: AbortSignal): Promise<Country[]> =>
    apiGet('/api/countries', z.array(countrySchema), signal),
  cities: async (countryCode: string, query: string, signal?: AbortSignal): Promise<City[]> => {
    const params = new URLSearchParams({ country: countryCode, q: query, limit: '4' })
    const data = await apiGet(`/api/cities?${params}`, z.array(citySchema).max(4), signal)
    if (data.some((city) => city.countryIsoCode !== countryCode))
      throw new Error('The location service returned places from a different country. Please try again.')
    return data
  },
}
