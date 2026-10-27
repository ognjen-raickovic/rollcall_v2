import { BackLink } from '@/components/back-link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdminUsers, useChangeAdminRole, usePermissions, useRoleAudit } from '../api/use-administration'
import type { AdminAccount } from '../api/administration-api'
import { useAuth } from '../api/use-auth'
import { ModerationDashboard } from './moderation-dashboard'
import { useAccountStatus } from '../api/use-account-status'
import { AccountAccess } from './account-access'

export function AdminNavigation() {
  const auth = useAuth(),
    permissions = usePermissions()
  const status = useAccountStatus(auth.data?.id ?? null)
  return auth.data &&
    status.data?.status === 'active' &&
    !permissions.isError &&
    permissions.data?.capabilities.accessAdmin ? (
    <Link to="/admin" className="text-sm font-medium hover:text-primary">
      Admin
    </Link>
  ) : null
}
function Feedback({
  pending,
  error,
  retry,
}: {
  pending: boolean
  error: Error | null
  retry: () => unknown
}) {
  if (pending) return <p role="status">Loading administration…</p>
  if (error)
    return (
      <div role="alert" className="space-y-3">
        <p>{error.message}</p>
        <Button variant="outline" onClick={() => void retry()}>
          Retry
        </Button>
      </div>
    )
  return null
}
export function AdminArea({ section }: { section: 'home' | 'users' | 'audit' | 'reports' | 'accounts' }) {
  const auth = useAuth(),
    permissions = usePermissions()
  const allowed = permissions.data?.capabilities.accessAdmin
  let content: ReactNode
  if (auth.isPending || permissions.isPending)
    content = <p role="status">Checking administrative permissions…</p>
  else if (permissions.isError)
    content = <Feedback pending={false} error={permissions.error} retry={permissions.refetch} />
  else if (
    !allowed ||
    ((section === 'users' || section === 'audit') && !permissions.data?.capabilities.manageAdminRoles)
  )
    content = (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Access restricted</h1>
        <p>You do not have permission to use this administrative page.</p>
        <BackLink to="/">
          Back to discovery
        </BackLink>
      </div>
    )
  else
    content = (
      <>
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">
            {section === 'users'
              ? 'Manage administrators'
              : section === 'audit'
                ? 'Role audit history'
                : section === 'reports'
                  ? 'Event reports'
                  : section === 'accounts'
                    ? 'Account access'
                    : 'Administration'}
          </h1>
          <p className="text-muted-foreground">
            Your current role:{' '}
            <strong className="capitalize text-foreground">{permissions.data?.role}</strong>
          </p>
        </header>
        <nav aria-label="Administration" className="flex flex-wrap gap-4 text-primary">
          <Link to="/admin">Overview</Link>
          <Link to="/admin/reports">Event reports</Link>
          <Link to="/admin/accounts">Account access</Link>
          {permissions.data?.capabilities.manageAdminRoles && (
            <>
              <Link to="/admin/users">Accounts and roles</Link>
              <Link to="/admin/role-audit">Role audit history</Link>
            </>
          )}
        </nav>
        {section === 'home' ? (
          <div className="rounded-xl border bg-card p-6 space-y-3">
            <h2 className="text-xl font-semibold">Administrative access</h2>
            <p>
              Administrative roles do not grant access to private profiles, invitation codes, addresses or
              ordinary host editing controls.
            </p>
            <p className="text-muted-foreground">
              Review event reports and make narrowly scoped, audited cancellation decisions. Account
              suspension and broader moderation remain deferred.
            </p>
          </div>
        ) : section === 'accounts' ? (
          <AccountAccess key={auth.data?.id} />
        ) : section === 'reports' ? (
          <ModerationDashboard key={auth.data?.id} />
        ) : section === 'users' ? (
          <AdminUsers key={auth.data?.id} />
        ) : (
          <RoleAudit key={auth.data?.id} />
        )}
      </>
    )
  return <section className="mx-auto w-full max-w-5xl space-y-6 px-4 py-12">{content}</section>
}
function AdminUsers() {
  const [after, setAfter] = useState<string | null>(null),
    [input, setInput] = useState(''),
    [lookup, setLookup] = useState(''),
    [validation, setValidation] = useState('')
  const users = useAdminUsers(after, lookup, true),
    change = useChangeAdminRole()
  const [target, setTarget] = useState<AdminAccount | null>(null),
    [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    auth = useAuth()
  useEffect(() => {
    const node = dialog.current
    if (target) {
      node?.showModal()
      cancel.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [target])
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-muted-foreground">
        Only confirmed accounts are listed. Use an exact account UUID for a narrow lookup. Email addresses and
        private profile fields are excluded.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !z.uuid().safeParse(input.trim()).success) {
            setValidation('Enter a valid account UUID.')
            return
          }
          setValidation('')
          setLookup(input.trim())
          setAfter(null)
        }}
      >
        <div className="w-full min-w-0 space-y-2 sm:w-auto sm:flex-1">
          <label htmlFor="admin-lookup" className="text-sm font-semibold">
            Account UUID (optional)
          </label>
          <Input
            id="admin-lookup"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={Boolean(validation)}
            aria-describedby="admin-lookup-feedback"
          />
        </div>
        <Button>Find account</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setInput('')
            setLookup('')
            setAfter(null)
            setValidation('')
          }}
        >
          Reset
        </Button>
        <p id="admin-lookup-feedback" role="alert" className="w-full text-sm text-destructive">
          {validation}
        </p>
      </form>
      <Feedback pending={users.isPending} error={users.error} retry={users.refetch} />
      {notice && <p role="status">{notice}</p>}
      {change.error && (
        <p role="alert" className="text-destructive">
          {change.error.message}
        </p>
      )}
      {!users.isError && users.data && (
        <>
          <ul className="space-y-3">
            {users.data.items.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
              >
                <div className="min-w-0 space-y-1">
                  <h2 className="text-xl font-semibold break-words">{user.displayName}</h2>
                  <p className="break-all text-xs text-muted-foreground">{user.id}</p>
                  <p className="text-sm capitalize">{user.role}</p>
                </div>
                {user.role !== 'superadmin' && user.id !== auth.data?.id ? (
                  <Button
                    variant="outline"
                    disabled={change.isPending}
                    onClick={() => {
                      change.reset()
                      setNotice('')
                      setTarget(user)
                    }}
                  >
                    {user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Protected role</span>
                )}
              </li>
            ))}
          </ul>
          {users.data.items.length === 0 && <p>No confirmed accounts match this lookup.</p>}
          <div className="flex gap-3">
            {after && (
              <Button variant="outline" onClick={() => setAfter(null)}>
                First page
              </Button>
            )}
            {users.data.nextCursor && (
              <Button variant="outline" onClick={() => setAfter(users.data.nextCursor)}>
                Next page
              </Button>
            )}
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="role-change-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(e) => {
          e.preventDefault()
          setTarget(null)
        }}
      >
        <h2 id="role-change-title" className="text-xl font-bold">
          Confirm role change
        </h2>
        <p className="break-words">
          Change {target?.displayName} from {target?.role} to {target?.role === 'admin' ? 'user' : 'admin'}?
          This changes future administrative access.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button ref={cancel} variant="outline" onClick={() => setTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={change.isPending}
            onClick={() => {
              if (!target) return
              const role = target.role === 'admin' ? 'user' : 'admin'
              change.mutate(
                { id: target.id, role },
                { onSuccess: () => setNotice(`Role updated to ${role}.`) },
              )
              setTarget(null)
            }}
          >
            Confirm role change
          </Button>
        </div>
      </dialog>
    </div>
  )
}
function RoleAudit() {
  const [before, setBefore] = useState<string | null>(null),
    audit = useRoleAudit(before, true)
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">
        Successful role transitions are recorded atomically. Repeated assignments create no duplicate audit
        entry.
      </p>
      <Feedback pending={audit.isPending} error={audit.error} retry={audit.refetch} />
      {!audit.isError && audit.data && (
        <>
          <ul className="space-y-3">
            {audit.data.items.map((entry) => (
              <li key={entry.id} className="space-y-2 rounded-xl border bg-card p-5 text-sm">
                <h2 className="text-xl font-semibold capitalize">
                  {entry.action}: {entry.previousRole} → {entry.newRole}
                </h2>
                <p className="break-all">Target: {entry.targetId}</p>
                <p className="break-all">Actor: {entry.actorId ?? 'Local operator bootstrap'}</p>
                <p className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          {audit.data.items.length === 0 && <p>No role changes have been recorded.</p>}
          <div className="flex gap-3">
            {before && (
              <Button variant="outline" onClick={() => setBefore(null)}>
                Latest entries
              </Button>
            )}
            {audit.data.nextCursor && (
              <Button variant="outline" onClick={() => setBefore(audit.data.nextCursor)}>
                Older entries
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
