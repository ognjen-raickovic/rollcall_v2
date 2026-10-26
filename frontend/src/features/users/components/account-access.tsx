import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '../api/use-auth'
import { useAccessAccount, useChangeSuspension } from '../api/use-account-status'
import { SuspensionHistory } from './suspension-history'
export function AccountAccess() {
  const auth = useAuth(),
    viewer = auth.data?.id ?? '',
    [input, setInput] = useState(''),
    [target, setTarget] = useState(''),
    [validation, setValidation] = useState(''),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState<boolean | null>(null),
    [notice, setNotice] = useState('')
  const account = useAccessAccount(viewer, target),
    change = useChangeSuspension(viewer),
    dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (confirm !== null) {
      node?.showModal()
      cancel.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [confirm])
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-muted-foreground">
        Look up one account by its exact UUID. Admins may manage ordinary users; superadmins may also manage
        admins. Roles and existing records are preserved.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!z.uuid().safeParse(input.trim()).success) {
            setValidation('Enter a valid account UUID.')
            return
          }
          setValidation('')
          setNotice('')
          setTarget(input.trim())
        }}
      >
        <div className="w-full space-y-2 sm:w-auto sm:flex-1">
          <label htmlFor="access-account-id" className="text-sm font-semibold">
            Account UUID
          </label>
          <Input
            id="access-account-id"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            required
            aria-invalid={Boolean(validation)}
            aria-describedby="access-validation"
          />
        </div>
        <Button>Look up account</Button>
        <p id="access-validation" role="alert" className="w-full text-sm text-destructive">
          {validation}
        </p>
      </form>
      {target && account.isPending && <p role="status">Loading account access…</p>}
      {account.error && (
        <div role="alert" className="space-y-3">
          <p>{account.error.message}</p>
          <Button variant="outline" onClick={() => void account.refetch()}>
            Retry lookup
          </Button>
        </div>
      )}
      {!account.isError && account.data && (
        <section className="space-y-4 rounded-xl border bg-card p-6" aria-labelledby="access-target-heading">
          <h2 id="access-target-heading" className="break-words text-xl font-bold">
            {account.data.displayName}
          </h2>
          <p className="break-all text-xs text-muted-foreground">{account.data.id}</p>
          <dl className="flex flex-wrap gap-6">
            <div>
              <dt className="text-sm text-muted-foreground">Role</dt>
              <dd className="capitalize">{account.data.role}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Account status</dt>
              <dd className="capitalize" data-testid="account-access-status">
                {account.data.status}
              </dd>
            </div>
          </dl>
          {account.data.canManage ? (
            <>
              <Button
                disabled={change.isPending}
                onClick={() => {
                  change.reset()
                  setNotice('')
                  setReason('')
                  setConfirm(account.data.status !== 'suspended')
                }}
              >
                {account.data.status === 'suspended' ? 'Reinstate Account' : 'Suspend Account'}
              </Button>
              <SuspensionHistory key={target} viewer={viewer} target={target} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your role cannot change this account’s access. Self-management and superadmin targets are
              protected.
            </p>
          )}
        </section>
      )}
      {change.isPending && <p role="status">Saving account access…</p>}
      {change.error && (
        <p role="alert" className="text-destructive">
          {change.error.message}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <dialog
        ref={dialog}
        aria-labelledby="access-confirm-heading"
        className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(event) => {
          event.preventDefault()
          setConfirm(null)
        }}
      >
        <h2 id="access-confirm-heading" className="text-2xl font-bold">
          {confirm ? 'Suspend this account?' : 'Reinstate this account?'}
        </h2>
        <p className="text-sm">
          {confirm
            ? 'Authenticated actions and protected access will stop. Existing records and roles will remain.'
            : 'The account will regain the functionality permitted by its existing role.'}
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (confirm === null || change.isPending) return
            const suspend = confirm
            change.mutate(
              { target, suspend, reason },
              {
                onSuccess: () => {
                  setNotice(suspend ? 'Account suspended.' : 'Account reinstated.')
                  setReason('')
                },
              },
            )
            setConfirm(null)
          }}
        >
          <div className="space-y-2">
            <label htmlFor="account-access-reason" className="text-sm font-semibold">
              Internal reason
            </label>
            <Input
              id="account-access-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              maxLength={500}
              required
              aria-describedby="access-reason-help"
            />
            <p id="access-reason-help" className="text-xs text-muted-foreground">
              5–500 characters on one line. Do not include addresses, credentials, room codes or unnecessary
              personal information.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button ref={cancel} type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button disabled={change.isPending}>Confirm {confirm ? 'suspension' : 'reinstatement'}</Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
