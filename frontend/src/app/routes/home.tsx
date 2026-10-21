import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function Home() {
  return (
    <section className="py-16">
      <h1 className="text-3xl font-bold tracking-tight">Find your next table</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Discover, organize, and join tabletop gaming events with RollCall. Explore D&D, trading card games,
        board games, and social deduction meetups.
      </p>
      <Button asChild className="mt-8">
        <Link to="/events">Explore events</Link>
      </Button>
    </section>
  )
}
