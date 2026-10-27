import { z } from 'zod'

const id = z.number().int().min(1).max(2147483647)
export const experienceSchema = z.enum(['beginner', 'intermediate', 'veteran'])
export const gameExperienceSchema = z.object({
  gameId: id,
  gameName: z.string().min(2).max(100),
  experience: experienceSchema,
})
export const publicProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(2).max(80),
  biography: z.string().max(500).nullable(),
  country: z.object({ id, isoCode: z.string().regex(/^[A-Z]{2}$/), name: z.string() }).nullable(),
  city: z
    .object({
      id,
      countryId: id,
      name: z.string(),
      administrativeDivision: z.string().nullable(),
      admin1Code: z.string().nullable(),
      admin2Code: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  gameExperience: z.array(gameExperienceSchema),
})
export const ownProfileSchema = publicProfileSchema.extend({
  birthYear: z.number().int().min(1900).nullable(),
  ageDeclaredAt: z.iso.datetime({ offset: true }).nullable(),
  hasDateOfBirth: z.boolean().optional(),
})
export const profilePatchSchema = z
  .strictObject({
    displayName: z
      .string()
      .trim()
      .min(2, 'Use at least 2 characters.')
      .max(80, 'Use at most 80 characters.')
      .refine(
        (value) =>
          !Array.from(value).some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
          ),
        'Do not use control characters.',
      )
      .optional(),
    biography: z.string().trim().max(500, 'Use at most 500 characters.').nullable().optional(),
    countryId: id.nullable().optional(),
    cityId: id.nullable().optional(),
    birthYear: z
      .number()
      .int()
      .min(1900)
      .refine((year) => year <= new Date().getUTCFullYear(), 'Birth year cannot be in the future.')
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field.')
export const profileIdSchema = z.strictObject({ userId: z.uuid() })
export const gameIdSchema = z.strictObject({
  gameId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(id),
})
export const experienceInputSchema = z.strictObject({ experience: experienceSchema })
export const catalogGameSchema = z.object({
  id,
  name: z.string(),
  category: z.enum(['role-playing', 'trading-card', 'board-game', 'social-deduction']),
  description: z.string(),
  minPlayers: z.number().int().positive(),
  maxPlayers: z.number().int().positive(),
})
export const noQuerySchema = z.strictObject({})
