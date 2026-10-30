import { CalendarDays, Gamepad2, Users } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { BackLink } from '@/components/back-link'

const activities = [
  {
    icon: CalendarDays,
    title: 'Find your next table',
    description:
      'Explore events by location, date, game and preferences. Find an open seat for your next game night.',
  },
  {
    icon: Users,
    title: 'Bring players together',
    description: 'Host a tabletop event, share the details and welcome players to your table.',
  },
  {
    icon: Gamepad2,
    title: 'Share what you play',
    description:
      'Build a player profile with your favorite games and self-declared experience, from beginner to veteran.',
  },
]

export function AboutContent() {
  return (
    <div className="space-y-6">
      <BackLink to="/">Back to discovery</BackLink>
      <div className="mx-auto w-full max-w-4xl space-y-8 py-4 md:space-y-12 md:py-8">
        <header className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Offline games. Real connections.
          </p>
          <h1 className="text-3xl font-bold tracking-tight">About RollCall</h1>
          <p className="leading-relaxed text-muted-foreground">
            Good games start with people to play with. RollCall helps tabletop players discover, host and join
            in-person gaming events.
          </p>
        </header>
        <section aria-labelledby="our-mission" className="space-y-4 rounded-xl border bg-card p-6 md:p-8">
          <h2 id="our-mission" className="text-xl font-semibold">
            Our mission
          </h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            Make finding a local game night easier, and give organizers a clear way to bring their community
            together. Less time searching for a group, more time around the table.
          </p>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            From Dungeons &amp; Dragons campaigns and trading card games to board game meetups and social
            deduction, there is more than one way to find your people.
          </p>
        </section>
        <section aria-labelledby="what-you-can-do" className="space-y-6">
          <h2 id="what-you-can-do" className="text-xl font-semibold">
            What you can do
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {activities.map(({ icon: Icon, title, description }) => (
              <li key={title} className="space-y-4 rounded-xl border bg-card p-6">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="community" className="max-w-2xl space-y-4">
          <h2 id="community" className="text-xl font-semibold">
            Built around community
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Your first session or your hundredth: there should be room to learn, share and enjoy good company.
            We encourage respectful, inclusive play and clear expectations between hosts and players.
          </p>
        </section>
        <section aria-labelledby="find-your-table" className="space-y-4 rounded-xl border bg-card p-6 md:p-8">
          <h2 id="find-your-table" className="text-xl font-semibold">
            Your next game night starts here
          </h2>
          <p className="text-muted-foreground">
            Explore local tables, or create an account to join the community.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/events">Browse events</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">Create an account</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
