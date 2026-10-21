import { Link } from 'react-router'

export function EditEvent() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Edit an event</h1>
      <p className="text-muted-foreground">
        The editing form and organizer controls will be added in a later task. No changes can be saved here
        yet.
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
