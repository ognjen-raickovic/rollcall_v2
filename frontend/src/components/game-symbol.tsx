import { Dices, Drama, Layers3, Puzzle, Swords } from 'lucide-react'

import { cn } from '@/lib/utils'

const symbols = {
  'role-playing': Swords,
  'trading-card': Layers3,
  'board-game': Puzzle,
  'social-deduction': Drama,
}

type GameSymbolProps = { category?: string; className?: string }

export function GameSymbol({ category, className }: GameSymbolProps) {
  const Icon = symbols[category as keyof typeof symbols] ?? Dices
  return <Icon aria-hidden="true" strokeWidth={1.5} className={cn('size-6', className)} />
}
