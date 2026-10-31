import { useEffect } from 'react'
import { Link } from 'react-router'
import { LayoutDashboard } from 'lucide-react'
import { useDashboardAccess } from '../api/use-dashboard-access'

type DashboardAccountLinkProps = { className: string; onNavigate: () => void }
export function DashboardAccountLink({ className, onNavigate }: DashboardAccountLinkProps) {
  const { allowed, refresh } = useDashboardAccess()
  useEffect(() => {
    void refresh()
  }, [refresh])
  return allowed ? (
    <Link to="/admin" className={className} onClick={onNavigate}>
      <LayoutDashboard className="size-4 shrink-0" aria-hidden="true" />
      Dashboard
    </Link>
  ) : null
}
