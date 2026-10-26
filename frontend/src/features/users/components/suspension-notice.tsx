import { Link } from 'react-router'
export function SuspensionNotice() {
  return (
    <aside className="mb-6 space-y-2 rounded-xl border bg-card p-4" aria-label="Account access">
      <p>Your account is suspended. You can browse public events; authenticated actions are unavailable.</p>
      <Link to="/profile" className="text-primary underline">
        View account access
      </Link>
    </aside>
  )
}
