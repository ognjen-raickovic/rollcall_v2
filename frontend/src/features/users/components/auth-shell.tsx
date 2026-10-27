import type { ReactNode } from 'react'
import { ArrowLeft, Dices } from 'lucide-react'
import { Link } from 'react-router'

type AuthShellProps = { title: string; description: string; children: ReactNode }

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-4 md:grid-cols-2 md:gap-12 md:py-12">
      <section className="space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to discovery
        </Link>
        <div className="flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-accent text-primary">
          <Dices className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="text-base leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <p className="rounded-lg border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          Discover local games and find your next table. Your email and date of birth stay private.
        </p>
      </section>
      <section className="min-w-0 self-start space-y-6 rounded-xl border bg-card p-6 md:p-8">
        {children}
      </section>
    </div>
  )
}
