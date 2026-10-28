import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'

import { GameSymbol } from '@/components/game-symbol'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useCatalogGames } from '../api/use-catalog'
import type { GameCategory } from '../types'

const categories: { id: GameCategory; title: string; description: string }[] = [
  { id: 'role-playing', title: 'Role-playing', description: 'A new world. Your story.' },
  { id: 'trading-card', title: 'Trading card games', description: 'Bring a deck. Find a rival.' },
  { id: 'board-game', title: 'Board games', description: 'One table. Endless possibilities.' },
  { id: 'social-deduction', title: 'Social deduction', description: 'Trust your friends. Or don’t.' },
]

export function GameCategories() {
  const games = useCatalogGames()
  return (
    <section aria-labelledby="categories-title" className="py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-center gap-4 text-center md:justify-between md:text-left">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            Every kind of player
          </p>
          <h2 id="categories-title" className="text-2xl font-bold tracking-tight">
            What’s your game?
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">Find a familiar favorite. Try something new.</p>
      </div>
      {games.isPending ? (
        <div
          role="status"
          aria-label="Loading game categories"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {categories.map((category) => (
            <Skeleton key={category.id} className="h-36" />
          ))}
        </div>
      ) : games.error ? (
        <div role="alert" className="space-y-4 rounded-lg border p-6">
          <p>Game categories couldn’t be loaded.</p>
          <Button variant="outline" onClick={() => void games.refetch()}>
            Try again
          </Button>
        </div>
      ) : !games.data?.length ? (
        <p role="status" className="rounded-lg border p-6 text-muted-foreground">
          More games are on the way. Explore all events in the meantime.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories
            .filter((category) => games.data.some((game) => game.category === category.id))
            .map((category) => (
              <li key={category.id}>
                <Link
                  to={`/events?category=${category.id}`}
                  className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-6 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                      <GameSymbol category={category.id} />
                    </span>
                    <ArrowUpRight
                      className="size-4 text-muted-foreground group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="font-semibold">{category.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
