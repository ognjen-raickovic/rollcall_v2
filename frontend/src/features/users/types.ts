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
