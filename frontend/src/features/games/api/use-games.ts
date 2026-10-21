import { useQuery } from '@tanstack/react-query'

import type { GameFilters } from '../types'
import { gamesApi } from './games-api'

export function useGames(filters: GameFilters = {}) {
  return useQuery({ queryKey: ['games', filters], queryFn: () => gamesApi.list(filters) })
}

export function useGame(id: number) {
  return useQuery({
    queryKey: ['games', id],
    queryFn: () => gamesApi.get(id),
    enabled: Number.isSafeInteger(id) && id > 0,
  })
}
