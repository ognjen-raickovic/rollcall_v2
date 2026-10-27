import { BackLink } from '@/components/back-link'
import type { ReactNode } from 'react'
import { Dices } from 'lucide-react'

type AuthShellProps = { title: string; description?: string; children: ReactNode }

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="space-y-6">
      <BackLink to="/">Back to discovery</BackLink>
      <div className="mx-auto w-full max-w-md space-y-6 py-4 md:py-8">
        <header className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-accent text-primary">
            <Dices className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </header>
        <section
          aria-label="Account access"
          className="min-w-0 space-y-6 rounded-xl border bg-card p-6 text-left md:p-8"
        >
          {children}
        </section>
      </div>
    </div>
  )
}
