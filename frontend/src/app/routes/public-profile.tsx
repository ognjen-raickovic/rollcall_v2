import { useParams } from 'react-router'
import { PublicProfile } from '@/features/users/components/public-profile'

export function PublicProfileRoute() {
  const { userId } = useParams()
  return <PublicProfile userId={userId ?? ''} />
}
