import { throwIfSuspended } from '../auth/account-status.js'
import { z } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'

export const roleSchema = z.enum(['user', 'admin', 'superadmin'])
export const permissionsSchema = z.object({
  role: roleSchema,
  capabilities: z.object({
    accessAdmin: z.boolean(),
    manageAdminRoles: z.boolean(),
  }),
})
const accountSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  role: roleSchema,
  createdAt: z.string(),
})
const auditSchema = z.object({
  id: z.string().regex(/^\d+$/),
  actorId: z.uuid().nullable(),
  targetId: z.uuid(),
  previousRole: roleSchema,
  newRole: roleSchema,
  action: z.enum(['bootstrap', 'promote', 'demote']),
  source: z.enum(['local_operator', 'authenticated_superadmin']),
  createdAt: z.string(),
})
export const roleResultSchema = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'admin']),
  changed: z.boolean(),
})
const usersSchema = z.object({
  items: z.array(accountSchema).max(50),
  nextCursor: z.uuid().nullable(),
})
const auditsSchema = z.object({
  items: z.array(auditSchema).max(50),
  nextCursor: z.string().nullable(),
})

function result<T>(value: { data: unknown; error: { code?: string } | null }, schema: z.ZodType<T>): T {
  if (value.error) {
    throwIfSuspended(value.error)
    const code = value.error.code
    if (code === '42501') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.')
    if (code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Account not found.')
    if (code === '22023')
      throw new ApiError(400, 'VALIDATION_ERROR', 'This role change or page is not allowed.')
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Administration is temporarily unavailable.')
  }
  const parsed = schema.safeParse(value.data)
  if (!parsed.success)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Administration is temporarily unavailable.')
  return parsed.data
}
export function createAdminRepository(client: DatabaseClient) {
  return {
    permissions: async () => result(await client.rpc('my_permissions'), permissionsSchema),
    users: async (limit: number, after?: string, userId?: string) =>
      result(
        await client.rpc('admin_users', {
          p_limit: limit,
          ...(after ? { p_after: after } : {}),
          ...(userId ? { p_user_id: userId } : {}),
        }),
        usersSchema,
      ),
    changeRole: async (id: string, role: 'user' | 'admin') =>
      result(await client.rpc('change_admin_role', { p_target: id, p_role: role }), roleResultSchema),
    audit: async (limit: number, before?: string, target?: string) =>
      result(
        await client.rpc('admin_role_audit', {
          p_limit: limit,
          ...(before ? { p_before: before } : {}),
          ...(target ? { p_target: target } : {}),
        }),
        auditsSchema,
      ),
  }
}
export type AdminRepository = ReturnType<typeof createAdminRepository>
