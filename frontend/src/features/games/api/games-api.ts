import { z } from 'zod'

import { mockRequest, NotFoundError, validate, validateId } from '@/lib/mock-db'

import type { Game, GameFilters } from '../types'
import { mockGames } from './mock-games'

const filtersSchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  category: z.enum(['role-playing', 'trading-card', 'board-game', 'social-deduction']).optional(),
})

export const gamesApi = {
  list: (filters: GameFilters = {}): Promise<Game[]> =>
    mockRequest(() => {
      const { search = '', category } = validate(filtersSchema, filters)
      return mockGames.filter(
        (game) =>
          game.name.toLowerCase().includes(search.toLowerCase()) && (!category || game.category === category),
      )
    }),
  get: (id: number): Promise<Game> =>
    mockRequest(() => {
      validateId(id)
      const game = mockGames.find((item) => item.id === id)
      if (!game) throw new NotFoundError('Game', id)
      return game
    }),
}
