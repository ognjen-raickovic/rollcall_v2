import type { ReactNode } from 'react'
import { Suspense, useSyncExternalStore } from 'react'
import { Dices } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { demoNavigationLink, desktopNavigationMedia, navigationLinks } from './navigation-links'

function subscribeViewport(listener: () => void) {
  const media = window.matchMedia(desktopNavigationMedia)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
const desktopViewport = () => window.matchMedia(desktopNavigationMedia).matches

type AppLayoutProps = {
  account: ReactNode
  mobileNavigation: ReactNode
  showDemoEvents?: boolean
  content?: ReactNode
  notice?: ReactNode
}

export function AppLayout({
  account,
  mobileNavigation,
  showDemoEvents = false,
  content,
  notice,
}: AppLayoutProps) {
  const desktop = useSyncExternalStore(subscribeViewport, desktopViewport, () => false)
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
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 xl:py-6"
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
          {desktop && (
            <ul className="flex items-center gap-6 text-sm">
              {navigationLinks.map((link) => (
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
                    to={demoNavigationLink.to}
                    className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {demoNavigationLink.label}
                  </NavLink>
                </li>
              )}
            </ul>
          )}
          {desktop && (
            <div className="flex shrink-0 items-center gap-2">
              {account}
              <ThemeToggle />
            </div>
          )}
          {!desktop && mobileNavigation}
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
          {notice}
          {content ?? <Outlet />}
        </Suspense>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-4 px-4 py-6 text-center text-sm md:justify-between md:text-left text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">RollCall</span> · Made for good company.
          </p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center justify-center gap-6 md:justify-start"
          >
            <NavLink
              to="/about"
              className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              About Us
            </NavLink>
            <NavLink
              to="/contact"
              className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              Contact
            </NavLink>
          </nav>
        </div>
      </footer>
    </div>
  )
}
