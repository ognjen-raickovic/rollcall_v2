import { z } from 'zod'

export const countriesQuerySchema = z.strictObject({})

export function citySearchSchema(defaultLimit: number, maximumLimit: number) {
  return z.strictObject({
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'Use a two-letter ISO country code.')
      .transform((value) => value.toUpperCase()),
    q: z
      .string()
      .trim()
      .max(80, 'Keep the city search to 80 characters.')
      .refine(
        (value) =>
          ![...value].some((character) => {
            const code = character.charCodeAt(0)
            return code < 32 || code === 127
          }),
        'Remove control characters from the search.',
      )
      .default(''),
    limit: z
      .string()
      .regex(/^[1-9]\d*$/, 'Use a positive integer result limit.')
      .transform(Number)
      .pipe(z.number().int().min(1).max(maximumLimit))
      .default(defaultLimit),
  })
}

export const countryRowsSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    iso_code: z.string().regex(/^[A-Z]{2}$/),
    name: z.string(),
  }),
)

export const cityRowsSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    country_id: z.number().int().positive(),
    name: z.string(),
    administrative_division: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }),
)
