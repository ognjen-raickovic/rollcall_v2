import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '../api/use-auth'

export function LogoutFeedback() {
  const auth = useAuth(),
    client = useQueryClient()
  const failures = useMutationState({
    filters: { mutationKey: ['auth-logout'], status: 'error' },
    select: (mutation) => mutation.state.status,
  })
  if (auth.isPending || auth.data || !failures.length) return null
  return (
    <div role="alert" className="mb-6 space-y-3 rounded-xl border border-destructive/40 bg-card p-4 text-sm">
      <p>
        This browser is logged out, but the authentication service did not confirm the logout. Check your
        connection before signing in again.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const cache = client.getMutationCache()
          for (const mutation of cache.findAll({ mutationKey: ['auth-logout'], status: 'error' }))
            cache.remove(mutation)
        }}
      >
        Dismiss logout message
      </Button>
    </div>
  )
}
