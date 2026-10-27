export type User = {
  id: number
  displayName: string
  city: string
  bio: string
  createdAt: string
}

export type UserFilters = { search?: string; city?: string }

// Real Auth identities never become numeric demo profile IDs.
export type Account = { id: string; email: string | null }

export type GameExperienceLevel = 'beginner' | 'intermediate' | 'veteran'

export type ProfileGameExperience = {
  gameId: number
  gameName: string
  experience: GameExperienceLevel
}

export type PublicProfile = {
  id: string
  displayName: string
  biography: string | null
  country: { id: number; isoCode: string; name: string } | null
  city: {
    id: number
    countryId: number
    name: string
    administrativeDivision: string | null
    admin1Code: string | null
    admin2Code: string | null
  } | null
  createdAt: string
  updatedAt: string
  gameExperience: ProfileGameExperience[]
}

export type OwnProfile = PublicProfile & {
  birthYear: number | null
  ageDeclaredAt: string | null
  hasDateOfBirth?: boolean
}

export type ProfileUpdate = {
  displayName?: string
  biography?: string | null
  countryId?: number | null
  cityId?: number | null
  birthYear?: number | null
}
