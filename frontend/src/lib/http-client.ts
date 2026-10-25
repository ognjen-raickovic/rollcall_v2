import type { ZodType } from 'zod'

export class HttpError extends Error {
  readonly status: number
  readonly fields: Record<string, string[]>
  constructor(status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.fields = fields
  }
}

type HttpOptions = {
  method?: 'GET' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string
  signal?: AbortSignal
}

export async function httpRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: HttpOptions = {},
): Promise<T> {
  const configured = (import.meta.env.VITE_API_ORIGIN ?? '').trim()
  const origin = new URL(configured || window.location.origin)
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('The API origin is invalid. Check the application configuration.')
  let response: Response
  try {
    response = await fetch(new URL(path, origin), {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
      cache: 'no-store',
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('The profile service is unavailable. Check your connection and try again.')
  }
  if (!response.ok) {
    const fields: Record<string, string[]> = {}
    if (response.status === 400) {
      try {
        const payload: unknown = await response.json()
        if (
          typeof payload === 'object' &&
          payload !== null &&
          'fields' in payload &&
          typeof payload.fields === 'object' &&
          payload.fields !== null
        ) {
          for (const [key, value] of Object.entries(payload.fields)) {
            if (Array.isArray(value) && value.every((message) => typeof message === 'string'))
              fields[key] = value
          }
        }
      } catch {
        /* Malformed error bodies never replace a safe message. */
      }
    }
    throw new HttpError(
      response.status,
      response.status === 401
        ? 'Your session could not be verified. Log in again to continue.'
        : response.status === 404
          ? 'This profile or game could not be found.'
          : response.status === 400
            ? 'Check the highlighted fields and try again.'
            : 'The profile service could not complete this request. Please try again.',
      fields,
    )
  }
  try {
    const payload: unknown = response.status === 204 ? undefined : await response.json()
    const result = schema.safeParse(payload)
    if (result.success) return result.data
  } catch {
    /* Treat malformed JSON like an invalid response contract. */
  }
  throw new Error('The profile service returned unexpected data. Please try again.')
}
