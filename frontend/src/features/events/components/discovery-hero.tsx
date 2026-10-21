import { ArrowDown, ArrowRight, Dices, MapPin, Search, Sparkles, Swords } from 'lucide-react'
import { Form, Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function DiscoveryHero() {
  return (
    <section aria-labelledby="hero-title" className="py-6 md:py-12">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-primary uppercase">
            <span className="size-2 rounded-full bg-primary" /> Offline games. Real connections.
          </p>
          <h1 id="hero-title" className="text-5xl leading-[1.05] font-bold tracking-tight md:text-6xl">
            Good games.
            <br />
            <span className="text-primary">Better company.</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            Your next adventure starts around a table. Find local game nights, meet your party, and make room
            for one more.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <a href="#upcoming">
                Find your next game <ArrowDown aria-hidden="true" />
              </a>
            </Button>
            <Link
              to="/events?availableOnly=true"
              className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              Find an open seat <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            First-timers, seasoned players, and everyone in between.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="relative isolate flex min-h-72 items-center justify-center overflow-hidden rounded-xl border border-primary/20 bg-card p-6 md:min-h-80"
        >
          <div className="absolute -top-16 -right-16 size-64 rounded-full border border-primary/10" />
          <div className="absolute -bottom-16 -left-16 size-64 rounded-full border border-primary/10" />
          <span className="absolute top-6 left-6 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Roll for a good night
          </span>
          <div className="absolute top-16 right-8 flex size-16 rotate-12 items-center justify-center rounded-xl border bg-secondary text-primary">
            <Swords className="size-8" strokeWidth={1.5} />
          </div>
          <div className="relative -rotate-6 rounded-xl border border-primary/40 bg-accent px-12 py-8 text-center">
            <Dices className="mx-auto size-24 text-primary" strokeWidth={1} />
            <span className="mt-4 block text-xs font-semibold tracking-widest text-accent-foreground uppercase">
              Adventure is a team sport
            </span>
          </div>
          <div className="absolute right-6 bottom-6 flex items-center gap-3 rounded-lg border bg-background px-4 py-3">
            <Sparkles className="size-5 text-primary" />
            <span className="text-sm font-medium">Your party is out there.</span>
          </div>
        </div>
      </div>
      <Form
        action="/events"
        method="get"
        role="search"
        aria-label="Discover tabletop events"
        className="mt-8 grid gap-4 rounded-xl border bg-card p-4 md:mt-12 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="discovery-search">
            <Search className="size-4 text-primary" aria-hidden="true" /> What do you want to play?
          </Label>
          <Input
            id="discovery-search"
            name="search"
            placeholder="D&D, Commander, board games..."
            maxLength={100}
            className="h-12 bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discovery-city">
            <MapPin className="size-4 text-primary" aria-hidden="true" /> Where’s your table?
          </Label>
          <Input
            id="discovery-city"
            name="city"
            placeholder="City, e.g. Podgorica"
            maxLength={80}
            className="h-12 bg-background"
          />
        </div>
        <Button type="submit" className="h-12 px-6">
          <Search aria-hidden="true" /> Find events
        </Button>
      </Form>
    </section>
  )
}
