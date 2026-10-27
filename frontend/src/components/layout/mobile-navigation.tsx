import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Dialog } from 'radix-ui'
import { Menu, Palette, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { demoNavigationLink, desktopNavigationMedia, navigationLinks } from './navigation-links'
import { ThemeToggle } from './theme-toggle'

export type MobileNavigationProps = {
  triggerRef: RefObject<HTMLButtonElement | null>
  renderAccount: (close: (afterClose?: () => void) => void) => ReactNode
  showDemoEvents?: boolean
}

export function MobileNavigation({ triggerRef, renderAccount, showDemoEvents }: MobileNavigationProps) {
  const [open, setOpen] = useState(false)
  const afterClose = useRef<(() => void) | undefined>(undefined)
  const location = useLocation()
  useEffect(() => {
    setOpen(false)
  }, [location.key])
  useEffect(() => {
    const media = window.matchMedia(desktopNavigationMedia)
    const change = () => {
      if (media.matches) setOpen(false)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const close = (callback?: () => void) => {
    afterClose.current = callback
    setOpen(false)
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 xl:hidden"
          aria-label="Open menu"
        >
          <Menu aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-250 motion-reduce:animate-none" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            const callback = afterClose.current
            afterClose.current = undefined
            if (callback) {
              event.preventDefault()
              callback()
            } else if (!triggerRef.current?.getClientRects().length) {
              event.preventDefault()
              document.getElementById('main-content')?.focus()
            }
          }}
          className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[calc(100%-1.5rem)] max-w-sm flex-col border-l bg-card text-card-foreground shadow-md data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-250 motion-reduce:animate-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4">
            <Dialog.Title className="text-xl font-semibold">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Close menu"
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
            <Dialog.Description className="sr-only">
              Site navigation, account actions and theme settings.
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
            <nav aria-label="Mobile navigation">
              <ul className="space-y-3">
                {[
                  ...navigationLinks,
                  ...(showDemoEvents ? [demoNavigationLink] : []),
                ].map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end
                      onClick={() => close()}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-11 items-center rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isActive && 'border-primary/40 bg-accent text-accent-foreground',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <section aria-label="Account" className="space-y-3 border-t pt-6">
              {renderAccount(close)}
            </section>
            <section
              aria-label="Theme"
              className="flex items-center justify-between gap-4 border-t pt-6"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <Palette className="size-4" aria-hidden="true" />
                Theme
              </span>
              <ThemeToggle />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
