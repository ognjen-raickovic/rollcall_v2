import { MyEvents } from '@/features/events/components/my-events'
import { useApiSession } from '@/features/users/api/use-auth'

export function MyEventsRoute() {
  const session = useApiSession()
  return <MyEvents session={session} />
}
