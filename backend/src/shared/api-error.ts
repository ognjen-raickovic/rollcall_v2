import type { ZodType } from 'zod'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_form'
    ;(fields[field] ??= []).push(issue.message)
  }
  throw new ApiError(400, 'VALIDATION_ERROR', 'Check the request parameters.', fields)
}

export function dependencyUnavailable(): ApiError {
  return new ApiError(
    503,
    'DEPENDENCY_UNAVAILABLE',
    'Geography data is temporarily unavailable. Try again shortly.',
  )
}
