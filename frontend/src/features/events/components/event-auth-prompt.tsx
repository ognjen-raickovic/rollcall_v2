import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { loginPath, safeReturnTo } from '@/lib/auth-navigation'

type EventAuthPromptProps = { open: boolean; onOpenChange: (open: boolean) => void; eventId: string }

export function EventAuthPrompt({ open, onOpenChange, eventId }: EventAuthPromptProps) {
  const returnTo = safeReturnTo(`/events/${eventId}`)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 pt-16 text-foreground">
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close authentication prompt"
              className="absolute top-3 left-3"
            >
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
          <Dialog.Title className="text-2xl font-bold">Join this event</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You need a RollCall account to join this event.
          </Dialog.Description>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button asChild>
              <Link to={loginPath(returnTo)}>Log in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Create account</Link>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
