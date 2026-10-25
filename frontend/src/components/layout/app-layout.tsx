import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { Dices } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const links = [
  { to: '/', label: 'Discover' },
  { to: '/events', label: 'Explore events' },
  { to: '/events/new', label: 'Host an event' },
]

type AppLayoutProps = { account: ReactNode; showDemoEvents?: boolean }

export function AppLayout({ account, showDemoEvents = false }: AppLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:p-4 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-4 px-4 py-4 md:py-6"
        >
          <Link
            to="/"
            className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Dices className="size-5" aria-hidden="true" />
            </span>
            RollCall
          </Link>
          <ul className="order-3 flex w-full flex-wrap items-center gap-6 text-sm md:order-none md:w-auto">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                      isActive && 'font-semibold text-foreground',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            {showDemoEvents && (
              <li>
                <NavLink
                  to="/demo/events"
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Demo events
                </NavLink>
              </li>
            )}
          </ul>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            {account}
          </div>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 [overflow-wrap:anywhere]"
      >
        <Suspense
          fallback={
            <p role="status" className="py-12 text-muted-foreground">
              Loading page...
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">RollCall</span> · Made for good company.
          </p>
          <p className="text-xs">Community preview · Event actions coming soon</p>
        </div>
      </footer>
    </div>
  )
}
