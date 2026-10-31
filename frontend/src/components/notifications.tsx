import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Toast } from 'radix-ui'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notificationStore } from '@/lib/notifications'

export function Notifications() {
  const notices = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.snapshot,
    notificationStore.snapshot,
  )
  const [host, setHost] = useState<HTMLElement | null>(null)
  const viewport = useRef<HTMLOListElement>(null)
  useEffect(() => {
    // Native modals live above ordinary portals. Keep announcements/dismissal in
    // the active modal's accessible tree without escaping its focus boundary.
    const update = () =>
      setHost(
        Array.from(
          document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][data-state="open"]'),
        ).at(-1) ?? document.body,
      )
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'data-state'],
    })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const node = viewport.current
    if (!node || typeof node.showPopover !== 'function') return
    // A manual top-layer viewport avoids clipping/transforms in preview dialogs.
    if (notices.length && !node.matches(':popover-open')) node.showPopover()
    if (!notices.length && node.matches(':popover-open')) node.hidePopover()
  }, [host, notices.length])
  if (!host) return null
  return createPortal(
    <Toast.Provider swipeDirection="right" duration={5000}>
      {notices.map((notice) => {
        const Icon = { success: CheckCircle2, error: CircleAlert, info: Info, warning: TriangleAlert }[
          notice.variant
        ]
        return (
          <Toast.Root
            key={notice.id}
            open
            onOpenChange={(open) => {
              if (!open) notificationStore.dismiss(notice.id)
            }}
            duration={notice.variant === 'error' ? 12000 : notice.variant === 'warning' ? 8000 : 5000}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg data-[state=closed]:hidden"
            type={notice.variant === 'info' ? 'background' : 'foreground'}
          >
            <Icon
              className={`mt-1 size-5 shrink-0 ${notice.variant === 'error' ? 'text-destructive' : 'text-primary'}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <Toast.Title className="text-sm font-semibold">{notice.title}</Toast.Title>
              {notice.description && (
                <Toast.Description className="text-sm leading-relaxed text-muted-foreground">
                  {notice.description}
                </Toast.Description>
              )}
            </div>
            <Toast.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </Button>
            </Toast.Close>
          </Toast.Root>
        )
      })}
      <Toast.Viewport
        ref={viewport}
        popover="manual"
        data-notifications
        aria-label="Notifications"
        className="pointer-events-none fixed top-auto right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-auto z-[100] m-0 flex max-h-[40dvh] w-[calc(100%-2rem)] max-w-sm list-none flex-col gap-3 overflow-y-auto border-0 bg-transparent p-0 outline-none"
      />
    </Toast.Provider>,
    host,
  )
}
