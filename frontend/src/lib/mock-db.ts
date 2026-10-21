import type { ZodType } from 'zod'

// Shared infrastructure only. Entity records belong to their own feature's api/ folder.

const DELAY_MS = 400

export const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), DELAY_MS))

export type ApiErrorCode = 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly fields: Record<string, string[]>

  constructor(code: ApiErrorCode, status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id: number) {
    super('NOT_FOUND', 404, `${resource} with id ${id} does not exist`)
    this.name = 'NotFoundError'
  }
}

export type MockActor = { userId: number | null }

// Stable fixture identities used by multiple features without importing feature modules.
export const mockReferences = {
  userIds: new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]),
  gameIds: new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]),
}

export function requireMockUser(actor: MockActor): number {
  const userId = actor?.userId
  if (userId == null || !Number.isSafeInteger(userId) || !mockReferences.userIds.has(userId)) {
    throw new ApiError('UNAUTHORIZED', 401, 'A known mock user is required.')
  }
  return userId
}

export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_form'
    fields[field] = [...(fields[field] ?? []), issue.message]
  }
  throw new ApiError('VALIDATION_ERROR', 400, 'Check the supplied fields.', fields)
}

export function validateId(id: number): void {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ApiError('VALIDATION_ERROR', 400, 'ID must be a positive safe integer.', {
      id: ['ID must be a positive safe integer.'],
    })
  }
}

// Work executes after latency; checks and writes run synchronously together to avoid overbooking.
// Clone responses so callers cannot mutate the in-memory store through query cache references.
export async function mockRequest<T>(work: () => T): Promise<T> {
  await delay(undefined)
  return structuredClone(work())
}
