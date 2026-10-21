import { Link } from 'react-router'

export function CreateEvent() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Create an event</h1>
      <p className="text-muted-foreground">
        The event form will be added in a later task. You cannot submit events from this page yet.
      </p>
      <Link
        to="/events"
        className="inline-block text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Back to events
      </Link>
    </section>
  )
}
