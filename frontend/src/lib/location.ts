import { z } from 'zod'

const geographicId = z.number().int().min(1).max(2147483647)

// Shared selection snapshot for route composition; geography owns catalog fetching.
export const locationReferenceSchema = z.strictObject({
  cityId: geographicId,
  countryId: geographicId,
  countryIsoCode: z.string().regex(/^[A-Z]{2}$/),
  countryName: z.string().trim().min(2).max(100),
  cityName: z.string().trim().min(1).max(200),
  administrativeDivision: z.string().trim().min(1).max(200).nullable(),
  admin1Code: z.string().trim().min(1).max(20).nullable(),
  admin2Code: z.string().trim().min(1).max(80).nullable(),
})

export type LocationReference = z.infer<typeof locationReferenceSchema>
