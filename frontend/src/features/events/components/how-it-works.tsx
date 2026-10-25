import { ArrowRight, CalendarCheck, Search, Users } from 'lucide-react'
import { Link } from 'react-router'

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="mb-8 rounded-xl border bg-card px-6 py-8 md:p-12"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            From “maybe” to game night
          </p>
          <h2 id="how-it-works-title" className="text-2xl font-bold tracking-tight">
            A good time is three moves away.
          </h2>
        </div>
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Make your move <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <ol className="grid gap-8 md:grid-cols-3">
        {[
          {
            Icon: Search,
            title: 'Find your game',
            description: 'Browse local tables by game, city, and what you feel like playing.',
          },
          {
            Icon: CalendarCheck,
            title: 'Get to know the table',
            description: 'Explore the host, schedule and player guidance. Joining will be available soon.',
          },
          {
            Icon: Users,
            title: 'Build your player profile',
            description: 'Share your favorite games and experience, ready for your next table.',
          },
        ].map(({ Icon, title, description }, index) => (
          <li key={title}>
            <div className="mb-4 flex items-center gap-3 text-primary">
              <Icon className="size-5" aria-hidden="true" />
              <span className="text-xs font-semibold">0{index + 1}</span>
            </div>
            <p className="font-semibold">{title}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
