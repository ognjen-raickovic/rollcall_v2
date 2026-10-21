export type User = {
  id: number
  displayName: string
  city: string
  bio: string
  createdAt: string
}

export type UserFilters = { search?: string; city?: string }
