import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginPath } from '@/lib/auth-navigation'
import type { EventActionSession } from '../api/event-write-dtos'
import { useInvitations } from '../api/use-invitations'

export function JoinPrivateEvent({ session }: { session: EventActionSession }) {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate()
  const [open, setOpen] = useState(params.get('joinPrivate') === '1'),
    [code, setCode] = useState(''),
    [localError, setLocalError] = useState('')
  const control = useInvitations(session),
    dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const node = dialog.current
    if (open && session.viewerId) {
      node?.showModal()
      input.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [open, session.viewerId])
  function close() {
    if (control.pending) return
    setCode('')
    setOpen(false)
    setLocalError('')
    if (params.has('joinPrivate'))
      setParams(
        (previous) => {
          previous.delete('joinPrivate')
          return previous
        },
        { replace: true },
      )
  }
  if (!session.viewerId)
    return (
      <Button asChild variant="outline">
        <Link to={loginPath('/events?joinPrivate=1')}>Join private event</Link>
      </Button>
    )
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Join private event
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="private-join-heading"
        className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <h2 id="private-join-heading" className="text-2xl font-bold">
          Join a private event
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter the room code shared by the host. Codes are not saved on this device.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setLocalError('')
            if (
              !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(code.toUpperCase().replace(/[ -]/g, ''))
            ) {
              setLocalError('Enter a valid 16-character room code.')
              return
            }
            void control
              .join(code)
              .then(async (id) => {
                await session.getAccessToken()
                if (id && mounted.current) {
                  setCode('')
                  await navigate(`/events/${id}`, {
                    state: { eventNotice: 'You have joined the private event.' },
                  })
                }
              })
              .catch(() => {})
          }}
        >
          <label htmlFor="private-room-code" className="block text-sm font-semibold">
            Room code
          </label>
          <Input
            id="private-room-code"
            ref={input}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            disabled={control.pending}
            aria-describedby="private-join-feedback"
            aria-invalid={Boolean(localError || control.error)}
          />
          <p
            id="private-join-feedback"
            role={localError || control.error ? 'alert' : 'status'}
            className="text-sm text-destructive"
          >
            {localError || control.error}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button disabled={control.pending}>{control.pending ? 'Joining...' : 'Join event'}</Button>
            <Button type="button" variant="outline" disabled={control.pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
