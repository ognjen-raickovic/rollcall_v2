import { z } from 'zod'

import { mockRequest, NotFoundError, validate, validateId } from '@/lib/mock-db'

import type { User, UserFilters } from '../types'
import { mockUsers } from './mock-users'

const filtersSchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
})

export const usersApi = {
  list: (filters: UserFilters = {}): Promise<User[]> =>
    mockRequest(() => {
      const { search = '', city } = validate(filtersSchema, filters)
      return mockUsers.filter(
        (user) =>
          user.displayName.toLowerCase().includes(search.toLowerCase()) &&
          (!city || user.city.toLowerCase() === city.toLowerCase()),
      )
    }),
  get: (id: number): Promise<User> =>
    mockRequest(() => {
      validateId(id)
      const user = mockUsers.find((item) => item.id === id)
      if (!user) throw new NotFoundError('User', id)
      return user
    }),
}
