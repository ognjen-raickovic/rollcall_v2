import { useEffect, useId, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth, useAuthLogout } from '../api/use-auth'
import { useLogout, useSession } from '../api/use-session'

type LogoutButtonProps = { demo?: boolean; iconOnly?: boolean }

export function LogoutButton({ demo = false, iconOnly = false }: LogoutButtonProps) {
  const headingId = useId(),
    descriptionId = useId()
  const auth = useAuth(),
    session = useSession()
  const realLogout = useAuthLogout(),
    demoLogout = useLogout()
  const logout = demo ? demoLogout : realLogout
  const busy =
    useIsMutating({ mutationKey: ['auth-logout'] }) + useIsMutating({ mutationKey: ['session-action'] }) > 0
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null)
  const trigger = useRef<HTMLButtonElement>(null),
    submitting = useRef(false)
  useEffect(() => {
    setOpen(false)
  }, [auth.data?.id, session.data?.id])
  useEffect(() => {
    if (!open) return
    const node = dialog.current
    node?.showModal()
    cancel.current?.focus()
    return () => {
      node?.close()
      trigger.current?.focus()
    }
  }, [open])
  async function confirm() {
    if (submitting.current || busy) return
    submitting.current = true
    try {
      await logout.mutateAsync()
      setOpen(false)
    } catch {
      /* The dialog renders the sanitized failure below. */
    } finally {
      submitting.current = false
    }
  }
  return (
    <>
      <Button
        ref={trigger}
        variant={iconOnly ? 'ghost' : 'outline'}
        size={iconOnly ? 'icon' : 'default'}
        aria-label="Log out"
        title="Log out"
        disabled={busy}
        onClick={() => {
          logout.reset()
          setOpen(true)
        }}
      >
        <LogOut aria-hidden="true" />
        {!iconOnly && 'Log out'}
      </Button>
      {open && (
        <dialog
          ref={dialog}
          aria-labelledby={headingId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            )
            const first = buttons[0],
              last = buttons.at(-1)
            if (!first) {
              event.preventDefault()
              event.currentTarget.focus()
            } else if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }}
          onCancel={(event) => {
            if (busy) event.preventDefault()
          }}
          onClose={() => setOpen(false)}
          className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md space-y-6 rounded-xl border bg-card p-6 text-center text-card-foreground backdrop:bg-background/80 md:p-8"
        >
          <h2 id={headingId} className="text-2xl font-bold">
            Log out of RollCall?
          </h2>
          <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
            You'll need to log in again to access your account.
          </p>
          <div className="grid grid-cols-2 items-center justify-center gap-4" aria-busy={busy}>
            <Button disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Logging out…' : 'Yes, log out'}
            </Button>
            <Button ref={cancel} variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              No, stay
            </Button>
          </div>
          {busy && (
            <p role="status" className="text-sm text-muted-foreground">
              Logging out securely…
            </p>
          )}
          {logout.error && (
            <p role="alert" className="text-sm text-destructive">
              We couldn't log you out. Check your connection and try again, or choose No, stay.
            </p>
          )}
        </dialog>
      )}
    </>
  )
}
