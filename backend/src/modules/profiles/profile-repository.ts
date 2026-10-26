import { throwIfSuspended } from '../auth/account-status.js'
import { z, type ZodType } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
import {
  catalogGameSchema,
  gameExperienceSchema,
  ownProfileSchema,
  publicProfileSchema,
} from './profile-schema.js'
import type { ProfileRepository } from './types.js'

type DatabaseError = { code: string }
function databaseError(error: DatabaseError): ApiError {
  throwIfSuspended(error)
  if (error.code === 'P0002')
    return new ApiError(404, 'NOT_FOUND', 'The requested profile or game was not found.')
  if (['22023', '22003', '22P02', '23514', '23503'].includes(error.code))
    return new ApiError(400, 'VALIDATION_ERROR', 'Check your profile details and selected location.', {
      _form: ['Choose a valid location and check the field values.'],
    })
  if (error.code === '42501')
    return new ApiError(403, 'FORBIDDEN', 'You cannot change these profile details.')
  return unavailable()
}
function unavailable(): ApiError {
  return new ApiError(
    503,
    'DEPENDENCY_UNAVAILABLE',
    'Profile data is temporarily unavailable. Try again shortly.',
  )
}
async function result<T>(
  request: PromiseLike<{ data: unknown; error: DatabaseError | null }>,
  schema: ZodType<T>,
  missing = false,
): Promise<T> {
  let response
  try {
    response = await request
  } catch {
    throw unavailable()
  }
  if (response.error) throw databaseError(response.error)
  if (missing && response.data === null) throw new ApiError(404, 'NOT_FOUND', 'This profile does not exist.')
  const parsed = schema.safeParse(response.data)
  if (!parsed.success) throw unavailable()
  return parsed.data
}

export function createProfileRepository(client: DatabaseClient): ProfileRepository {
  return {
    getPublic: (userId) =>
      result(client.rpc('public_profile', { p_user_id: userId }), publicProfileSchema, true),
    getOwn: () => result(client.rpc('get_my_profile'), ownProfileSchema, true),
    updateOwn: (patch) => result(client.rpc('update_my_profile', { p_patch: patch }), ownProfileSchema, true),
    getExperience: async (userId) =>
      (await result(client.rpc('public_profile', { p_user_id: userId }), publicProfileSchema, true))
        .gameExperience,
    setExperience: (gameId, experience) =>
      result(
        client.rpc('set_my_game_experience', { p_game_id: gameId, p_experience: experience }),
        gameExperienceSchema,
      ),
    removeExperience: async (gameId) => {
      await result(client.rpc('remove_my_game_experience', { p_game_id: gameId }), z.null())
    },
    listGames: async () => {
      const rows = await result(
        client
          .from('games')
          .select('id,name,category,description,min_players,max_players')
          .order('name')
          .order('id'),
        z.array(
          z.object({
            id: z.number().int().positive(),
            name: z.string(),
            category: z.string(),
            description: z.string(),
            min_players: z.number(),
            max_players: z.number(),
          }),
        ),
      )
      return result(
        Promise.resolve({
          data: rows.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            description: row.description,
            minPlayers: row.min_players,
            maxPlayers: row.max_players,
          })),
          error: null,
        }),
        z.array(catalogGameSchema),
      )
    },
  }
}
