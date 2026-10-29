import { GameSymbol } from '@/components/game-symbol'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { gameCategoryLabel } from '@/lib/game-categories'

import { useGame } from '../api/use-games'

type GameSummaryProps = { gameId: number }

export function GameSummary({ gameId }: GameSummaryProps) {
  const game = useGame(gameId)
  if (game.isPending)
    return (
      <div role="status" aria-label="Loading game">
        <Skeleton className="h-10 w-60" />
      </div>
    )
  if (game.error || !game.data)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Game information is unavailable.</p>
        <Button variant="outline" size="sm" onClick={() => void game.refetch()}>
          Retry game
        </Button>
      </div>
    )
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <GameSymbol category={game.data.category} />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">The game</p>
        <p className="font-semibold">{game.data.name}</p>
        <p className="text-sm text-muted-foreground">{gameCategoryLabel(game.data.category)}</p>
      </div>
    </div>
  )
}
