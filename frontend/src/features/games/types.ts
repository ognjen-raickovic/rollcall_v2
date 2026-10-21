export type GameCategory = 'role-playing' | 'trading-card' | 'board-game' | 'social-deduction'

export type Game = {
  id: number
  name: string
  category: GameCategory
  description: string
  minPlayers: number
  maxPlayers: number
}

export type GameFilters = { search?: string; category?: GameCategory }
