import { useLocation } from 'react-router'
import { AdminArea } from '@/features/users/components/administration'
import { useAuth } from '@/features/users/api/use-auth'

export function AdministrationRoute() {
  const { pathname } = useLocation(),
    auth = useAuth()
  return (
    <AdminArea
      key={auth.data?.id ?? 'anonymous'}
      section={pathname === '/admin/users' ? 'users' : pathname === '/admin/role-audit' ? 'audit' : 'home'}
    />
  )
}
