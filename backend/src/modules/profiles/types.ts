import type { z } from 'zod'
import type {
  catalogGameSchema,
  gameExperienceSchema,
  ownProfileSchema,
  profilePatchSchema,
  publicProfileSchema,
  replaceExperienceSchema,
} from './profile-schema.js'

export type PublicProfile = z.infer<typeof publicProfileSchema>
export type OwnProfile = z.infer<typeof ownProfileSchema>
export type ProfilePatch = z.infer<typeof profilePatchSchema>
export type GameExperience = z.infer<typeof gameExperienceSchema>
export type CatalogGame = z.infer<typeof catalogGameSchema>

export interface ProfileRepository {
  getPublic(userId: string): Promise<PublicProfile>
  getOwn(): Promise<OwnProfile>
  updateOwn(patch: ProfilePatch): Promise<OwnProfile>
  getExperience(userId: string): Promise<GameExperience[]>
  setExperience(gameId: number, experience: GameExperience['experience']): Promise<GameExperience>
  removeExperience(gameId: number): Promise<void>
  replaceExperience(input: z.infer<typeof replaceExperienceSchema>): Promise<GameExperience[]>
  listGames(): Promise<CatalogGame[]>
}
