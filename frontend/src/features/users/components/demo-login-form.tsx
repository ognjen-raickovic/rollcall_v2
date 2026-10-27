import { BackLink } from '@/components/back-link'
import { useState } from 'react'
import { ArrowRight, Check, Dices, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { safeReturnTo } from '@/lib/auth-navigation'

import { useLogin, useSession } from '../api/use-session'
import { useUsers } from '../api/use-users'
import { UserAvatar } from './user-avatar'
import { useAuth } from '../api/use-auth'

export function DemoLoginForm() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const users = useUsers()
  const session = useSession()
  const login = useLogin()
  const auth = useAuth()

  if (auth.isPending)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        Checking your account...
      </p>
    )
  if (auth.data) return <Navigate to="/account" replace />
  if (session.data) return <Navigate to={returnTo} replace />

  return (
    <div className="mx-auto grid max-w-5xl gap-12 py-4 md:py-12 lg:grid-cols-5 lg:gap-16">
      <section className="space-y-6 lg:col-span-2">
        <BackLink
          to="/"
        >
          Back to discovery
        </BackLink>
        <div className="flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-accent text-primary">
          <Dices className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Your next session starts here
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            There’s a seat
            <br />
            with your name on it.
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Pick a demo player and find your people. A first adventure, a friendly duel, or one more round.
          </p>
        </div>
        <p className="flex items-start gap-2 rounded-lg border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
          This is a workshop demo. No password needed. Your selection stays in this tab until you log out or
          close it.
        </p>
      </section>
      <section aria-labelledby="choose-player" className="rounded-xl border bg-card p-6 lg:col-span-3 md:p-8">
        <h2 id="choose-player" className="text-2xl font-semibold tracking-tight">
          Choose your player
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Log in with an existing demo profile.</p>
        {users.isPending ? (
          <div role="status" aria-label="Loading demo profiles" className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        ) : users.error ? (
          <div role="alert" className="mt-6 space-y-4">
            <p className="text-muted-foreground">Demo profiles couldn’t be loaded.</p>
            <Button variant="outline" onClick={() => void users.refetch()}>
              Try again
            </Button>
          </div>
        ) : !users.data?.length ? (
          <p role="status" className="mt-6 text-muted-foreground">
            No demo profiles are available right now.
          </p>
        ) : (
          <form
            className="mt-6 space-y-6"
            onSubmit={(event) => {
              event.preventDefault()
              if (selectedId !== null) login.mutate(selectedId)
            }}
          >
            <fieldset disabled={login.isPending || session.isPending} className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Demo player profiles</legend>
              {users.data.map((user) => (
                <label
                  key={user.id}
                  className="relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary has-checked:border-primary has-checked:bg-accent/50 has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-wait has-disabled:opacity-60"
                >
                  <input
                    type="radio"
                    name="demo-user"
                    value={user.id}
                    checked={selectedId === user.id}
                    onChange={() => {
                      setSelectedId(user.id)
                      login.reset()
                    }}
                    className="peer sr-only"
                    required
                  />
                  <UserAvatar name={user.displayName} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{user.displayName}</span>
                    <span className="block text-xs text-muted-foreground">{user.city}</span>
                  </span>
                  <Check
                    className="hidden size-4 shrink-0 text-primary peer-checked:block"
                    aria-hidden="true"
                  />
                </label>
              ))}
            </fieldset>
            {login.error && (
              <p role="alert" className="text-sm text-destructive">
                We couldn’t log you in. Please try again.
              </p>
            )}
            {session.error && (
              <p role="status" className="text-sm text-muted-foreground">
                Your previous session couldn’t be restored. Choose a profile to start a new one.
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={selectedId === null || login.isPending || session.isPending}
            >
              {login.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" /> Logging in...
                </>
              ) : (
                <>
                  Let’s play <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Just looking?{' '}
              <Link
                to="/events"
                className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Browse without logging in
              </Link>
            </p>
          </form>
        )}
      </section>
    </div>
  )
}
