import { z } from 'zod'
import { httpRequest } from '@/lib/http-client'
import { authClient } from './auth-client'
import type { GameExperienceLevel, OwnProfile, ProfileUpdate, PublicProfile } from '../types'

const id = z.number().int().positive()
export const gameExperienceSchema = z.object({
  gameId: id,
  gameName: z.string(),
  experience: z.enum(['beginner', 'intermediate', 'veteran']),
})
export const publicProfileSchema = z.object({
  id: z.uuid(),
  username: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{2,23}$/)
    .nullable()
    .optional(),
  displayName: z.string(),
  biography: z.string().nullable(),
  country: z.object({ id, isoCode: z.string(), name: z.string() }).nullable(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
  gameExperience: z.array(gameExperienceSchema),
})
const ownProfileSchema = publicProfileSchema.extend({
  birthYear: z.number().int().nullable(),
  ageDeclaredAt: z.string().nullable(),
  hasDateOfBirth: z.boolean().optional(),
})

async function accessToken(ownerId: string): Promise<string> {
  const { data, error } = await authClient().auth.getSession()
  if (error || !data.session || data.session.user.id !== ownerId)
    throw new Error('Your account changed. Reload this page before changing your profile.')
  return data.session.access_token
}

export const profilesApi = {
  correctUsername: async (username: string, expected: string, ownerId: string) => {
    const result = await httpRequest('/api/me/username-casing', ownProfileSchema, {
      method: 'PATCH',
      body: { username, expected },
      token: await accessToken(ownerId),
      viewerId: ownerId,
    })
    await accessToken(ownerId)
    if (result.id !== ownerId) throw new Error('Your profile could not be verified.')
    return result
  },
  getOwn: async (ownerId: string, signal?: AbortSignal): Promise<OwnProfile> => {
    const profile = await httpRequest('/api/me/profile', ownProfileSchema, {
      token: await accessToken(ownerId),
      viewerId: ownerId,
      signal,
    })
    if (profile.id !== ownerId) throw new Error('Your profile could not be verified. Log in again.')
    await accessToken(ownerId)
    return profile
  },
  getPublic: (userId: string, signal?: AbortSignal): Promise<PublicProfile> =>
    httpRequest(`/api/users/${encodeURIComponent(z.uuid().parse(userId))}`, publicProfileSchema, {
      signal,
    }),
  update: async (update: ProfileUpdate, ownerId: string): Promise<OwnProfile> => {
    const profile = await httpRequest('/api/me/profile', ownProfileSchema, {
      method: 'PATCH',
      body: update,
      token: await accessToken(ownerId),
      viewerId: ownerId,
    })
    if (profile.id !== ownerId) throw new Error('Your profile could not be verified. Log in again.')
    await accessToken(ownerId)
    return profile
  },
  replaceExperience: async (
    value: {
      games: { gameId: number; experience: GameExperienceLevel }[]
      expected: { gameId: number; experience: GameExperienceLevel }[]
    },
    ownerId: string,
    signal?: AbortSignal,
  ) => {
    const result = await httpRequest('/api/me/game-experience', z.array(gameExperienceSchema).max(50), {
      method: 'PUT',
      body: value,
      token: await accessToken(ownerId),
      viewerId: ownerId,
      signal,
    })
    await accessToken(ownerId)
    if (signal?.aborted) throw new Error('Your account changed. Reload your games.')
    return result
  },
  experience: async (ownerId: string, signal?: AbortSignal) =>
    httpRequest('/api/me/game-experience', z.array(gameExperienceSchema), {
      token: await accessToken(ownerId),
      viewerId: ownerId,
      signal,
    }),
  setExperience: async (
    { gameId, experience }: { gameId: number; experience: GameExperienceLevel },
    ownerId: string,
  ) =>
    httpRequest(`/api/me/game-experience/${gameId}`, gameExperienceSchema, {
      method: 'PUT',
      body: { experience },
      token: await accessToken(ownerId),
      viewerId: ownerId,
    }),
  removeExperience: async (gameId: number, ownerId: string) =>
    httpRequest(`/api/me/game-experience/${gameId}`, z.undefined(), {
      method: 'DELETE',
      token: await accessToken(ownerId),
      viewerId: ownerId,
    }),
}
