import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function Home() {
  return (
    <section className="py-16">
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Workshop 3 starter</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        An empty React project ready for Claude Code. First step: let Claude interview you about the design
        and write DESIGN.md.
      </p>
      <Button asChild className="mt-8">
        <Link to="/listings">See the example list</Link>
      </Button>
    </section>
  )
}
