import { Link, NavLink, Outlet } from 'react-router'

import { cn } from '@/lib/utils'

const links = [
  { to: '/', label: 'Home' },
  { to: '/events', label: 'Events' },
  { to: '/events/new', label: 'Create event' },
  { to: '/login', label: 'Log in' },
]

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:p-4 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4"
        >
          <Link
            to="/"
            className="font-heading text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            RollCall
          </Link>
          <ul className="flex flex-wrap gap-4 text-sm">
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
          </ul>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
