import { z } from 'zod'
import { httpRequest, HttpError } from '@/lib/http-client'
import { authApi } from './auth-api'

const role = z.enum(['user', 'admin', 'superadmin'])
export const permissionsSchema = z.object({
  role,
  capabilities: z.object({ accessAdmin: z.boolean(), manageAdminRoles: z.boolean() }),
})
const account = z.object({ id: z.uuid(), displayName: z.string(), role, createdAt: z.string() })
const audit = z.object({
  id: z.string(),
  actorId: z.uuid().nullable(),
  targetId: z.uuid(),
  previousRole: role,
  newRole: role,
  action: z.enum(['bootstrap', 'promote', 'demote']),
  source: z.enum(['local_operator', 'authenticated_superadmin']),
  createdAt: z.string(),
})
const users = z.object({ items: z.array(account), nextCursor: z.uuid().nullable() })
const audits = z.object({ items: z.array(audit), nextCursor: z.string().nullable() })
export type AdminAccount = z.infer<typeof account>
export type Permissions = z.infer<typeof permissionsSchema>
export type AuditRecord = z.infer<typeof audit>
async function request<T>(
  viewer: string,
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  body?: unknown,
) {
  const token = await authApi.accessToken(viewer)
  if (!token) throw new HttpError(401, 'Log in to continue.')
  const result = await httpRequest(path, schema, {
    token,
    signal,
    method: body === undefined ? 'GET' : 'PATCH',
    body,
  })
  if (!(await authApi.accessToken(viewer)) || signal?.aborted)
    throw new Error('Your account changed. Try again.')
  return result
}
export const administrationApi = {
  permissions: (viewer: string, signal?: AbortSignal) =>
    request(viewer, '/api/me/permissions', permissionsSchema, signal),
  users: (viewer: string, after: string | null, userId: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ limit: '20' })
    if (after) query.set('after', z.uuid().parse(after))
    if (userId) query.set('userId', z.uuid().parse(userId))
    return request(viewer, `/api/admin/users?${query}`, users, signal)
  },
  audit: (viewer: string, before: string | null, signal?: AbortSignal) =>
    request(
      viewer,
      `/api/admin/role-audit?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      audits,
      signal,
    ),
  changeRole: (viewer: string, id: string, role: 'user' | 'admin', signal: AbortSignal) =>
    request(
      viewer,
      `/api/admin/users/${z.uuid().parse(id)}/role`,
      z.object({ id: z.uuid(), role: z.enum(['user', 'admin']), changed: z.boolean() }),
      signal,
      { role },
    ),
}
