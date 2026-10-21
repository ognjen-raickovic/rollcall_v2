import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { EventsList } from '@/features/events/components/events-list'

export function Events() {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Events</h1>
        <Button asChild variant="outline">
          <Link to="/events/new">Create event</Link>
        </Button>
      </div>
      <p className="mt-4 text-muted-foreground">Explore tabletop meetups. This preview uses sample events.</p>
      <EventsList />
    </section>
  )
}
