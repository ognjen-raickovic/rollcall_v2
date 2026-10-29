import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type EventPreviewDialogProps = {
  children: ReactNode
  onClose: () => void
  focusId: string | null
  scrollY: number
}
export function EventPreviewDialog({ children, onClose, focusId, scrollY }: EventPreviewDialogProps) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby="event-preview-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            requestAnimationFrame(() => {
              if (window.location.pathname !== '/events') return
              if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true })
              requestAnimationFrame(() =>
                window.scrollTo({ top: Math.max(0, scrollY), behavior: 'instant' }),
              )
            })
          }}
          className="fixed top-1/2 left-1/2 z-40 max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border bg-background p-4 pt-16 text-foreground [overflow-wrap:anywhere] sm:w-[calc(100%-2rem)] sm:p-6 sm:pt-16"
        >
          <Dialog.Title className="sr-only">Event preview</Dialog.Title>
          <Dialog.Description id="event-preview-description" className="sr-only">
            Review this table without leaving your filtered event results.
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Close event preview"
              className="absolute top-4 right-4"
            >
              <X aria-hidden="true" />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
