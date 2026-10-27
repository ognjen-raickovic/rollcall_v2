import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import { authApi } from './auth-api'
const state = z.enum(['active', 'suspended'])
export const selfStatusSchema = z.object({ status: state })
async function request<T>(
  viewer: string,
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: unknown,
) {
  const token = await authApi.accessToken(viewer)
  if (!token) throw new HttpError(401, 'Log in to continue.')
  const result = await httpRequest(path, schema, {
    token,
    viewerId: viewer,
    signal,
    method,
    body,
    resource: 'auth',
  })
  if (!(await authApi.accessToken(viewer)) || signal.aborted)
    throw new Error('Your account changed. Try again.')
  return result
}
export const accountStatusApi = {
  self: (viewer: string, signal: AbortSignal) =>
    request(viewer, '/api/me/account-status', selfStatusSchema, signal),
  lookup: (viewer: string, target: string, signal: AbortSignal) =>
    request(
      viewer,
      `/api/admin/account-lookup?userId=${z.uuid().parse(target)}`,
      z.object({
        id: z.uuid(),
        displayName: z.string(),
        role: z.enum(['user', 'admin', 'superadmin']),
        status: state,
        canManage: z.boolean(),
      }),
      signal,
    ),
  change: (viewer: string, target: string, suspend: boolean, reason: string, signal: AbortSignal) =>
    request(
      viewer,
      `/api/admin/users/${z.uuid().parse(target)}/suspension`,
      z.object({ id: z.uuid(), status: state, changed: z.boolean() }),
      signal,
      suspend ? 'POST' : 'DELETE',
      { reason: reason.trim() },
    ),
  audit: (viewer: string, target: string, before: string | null, signal: AbortSignal) =>
    request(
      viewer,
      `/api/admin/suspension-audit?targetId=${z.uuid().parse(target)}&limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            actorId: z.uuid(),
            targetId: z.uuid(),
            action: z.enum(['suspend', 'reinstate']),
            previousStatus: state,
            newStatus: state,
            reason: z.string(),
            createdAt: z.string(),
          }),
        ),
        nextCursor: z.string().nullable(),
      }),
      signal,
    ),
}
