import { useRef } from 'react'
import { DropdownMenu } from 'radix-ui'
import { CalendarDays, LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { LogoutButton } from './logout-button'

const itemStyle =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50'
export function AccountMenu() {
  const avatar = useRef<HTMLButtonElement>(null)
  return (
    <LogoutButton
      returnFocusRef={avatar}
      trigger={(openLogout, busy) => (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button ref={avatar} variant="ghost" size="icon" aria-label="Account menu">
              <UserRound aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="z-50 w-52 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-2 text-popover-foreground shadow-md"
            >
              <DropdownMenu.Item className={itemStyle} asChild>
                <Link to="/profile">
                  <UserRound className="size-4" aria-hidden="true" />
                  My Profile
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemStyle} asChild>
                <Link to="/account">
                  <Settings className="size-4" aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemStyle} asChild>
                <Link to="/my-events">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  My Events
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-2 h-px bg-border" />
              <DropdownMenu.Item
                className={itemStyle}
                disabled={busy}
                onSelect={() => requestAnimationFrame(openLogout)}
              >
                <LogOut className="size-4" aria-hidden="true" />
                Log out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    />
  )
}
