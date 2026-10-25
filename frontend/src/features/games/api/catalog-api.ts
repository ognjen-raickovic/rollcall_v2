import { z } from 'zod'
import { httpRequest } from '@/lib/http-client'
import type { Game } from '../types'

const gamesSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    name: z.string(),
    category: z.enum(['role-playing', 'trading-card', 'board-game', 'social-deduction']),
    description: z.string(),
    minPlayers: z.number().int(),
    maxPlayers: z.number().int(),
  }),
)

export const catalogApi = {
  list: (signal?: AbortSignal): Promise<Game[]> => httpRequest('/api/games', gamesSchema, { signal }),
}
