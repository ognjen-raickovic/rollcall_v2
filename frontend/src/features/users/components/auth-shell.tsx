import type { ReactNode } from 'react'
import { ArrowLeft, Dices } from 'lucide-react'
import { Link } from 'react-router'

type AuthShellProps = { title: string; description?: string; children: ReactNode }

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-4 md:py-8">
      <header className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-accent text-primary">
          <Dices className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </header>
      <section
        aria-label="Account access"
        className="min-w-0 space-y-6 rounded-xl border bg-card p-6 text-left md:p-8"
      >
        {children}
      </section>
      <div className="text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to discovery
        </Link>
      </div>
    </div>
  )
}
