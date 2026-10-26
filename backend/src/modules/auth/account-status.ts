import { z } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
export const accountStatusSchema = z.object({ status: z.enum(['active', 'suspended']) })
export function suspendedError() {
  return new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your RollCall application access is suspended.')
}
export function throwIfSuspended(error: { code?: string; message?: string } | null) {
  if (error?.code === 'PT403' && error.message === 'ACCOUNT_SUSPENDED') throw suspendedError()
}
export async function readAccountStatus(client: DatabaseClient) {
  const result = await client.rpc('my_account_status')
  throwIfSuspended(result.error)
  if (result.error?.code === '42501') throw new ApiError(403, 'FORBIDDEN', 'This account is not available.')
  if (result.error)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account status is temporarily unavailable.')
  const parsed = accountStatusSchema.safeParse(result.data)
  if (!parsed.success)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account status is temporarily unavailable.')
  return parsed.data
}
