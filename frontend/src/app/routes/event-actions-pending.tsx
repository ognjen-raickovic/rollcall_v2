import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function EventActionsPending() {
  return (
    <section className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight">Event hosting is coming soon</h1>
      <p className="leading-relaxed text-muted-foreground">
        You can explore upcoming events and view their details now. Creating and editing events will be
        available in a future update.
      </p>
      <Button asChild variant="outline">
        <Link to="/events">Explore events</Link>
      </Button>
    </section>
  )
}
