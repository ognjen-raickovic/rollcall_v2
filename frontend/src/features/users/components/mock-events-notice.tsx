import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { demoModeEnabled } from '../api/auth-client'

export function MockEventsNotice() {
  return (
    <section className="mx-auto max-w-xl space-y-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Event hosting is still a demo</h1>
      <p className="text-muted-foreground">
        This development area uses numeric demo players and in-memory events. Your real account can view
        persistent events through Explore events; it cannot act as a demo player.
      </p>
      {demoModeEnabled && (
        <p className="text-sm text-muted-foreground">
          For development testing, log out of your real account and choose a demo player. Real accounts never
          inherit a demo player's identity.
        </p>
      )}
      <Button asChild>
        <Link to="/events">Explore events</Link>
      </Button>
    </section>
  )
}
