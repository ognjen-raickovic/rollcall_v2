import type { ZodType } from 'zod'

const errorCodes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_ERROR',
  415: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'DEPENDENCY_UNAVAILABLE',
}
const eventConflicts = new Set([
  'Administratively cancelled events cannot be reactivated.',
  'This event is full.',
  'Attendance is only available for scheduled events that have not started.',
  'Hosts cannot join or leave their own event as a participant.',
  'Capacity cannot be lower than current attendance.',
])

export class HttpError extends Error {
  readonly status: number
  readonly fields: Record<string, string[]>
  readonly code: string
  constructor(
    status: number,
    message: string,
    fields: Record<string, string[]> = {},
    code = errorCodes[status] ?? 'HTTP_ERROR',
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.fields = fields
    this.code = code
  }
}

type HttpOptions = {
  viewerId?: string | null
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string
  signal?: AbortSignal
  resource?: 'profile' | 'event' | 'auth'
}

export async function httpRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: HttpOptions = {},
): Promise<T> {
  const resource = options.resource ?? 'profile'
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
  const url = new URL(path, origin)
  if (!path.startsWith('/api/') || url.origin !== origin.origin)
    throw new Error('The API request address is invalid.')
  let response: Response
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: multipart
        ? (options.body as FormData)
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(multipart ? 20000 : 5000)])
        : AbortSignal.timeout(multipart ? 20000 : 5000),
      cache: 'no-store',
      redirect: 'error',
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(`The ${resource} service is unavailable. Check your connection and try again.`)
  }
  if (!response.ok) {
    const fields: Record<string, string[]> = {}
    let code = errorCodes[response.status] ?? 'HTTP_ERROR'
    let conflict: string | undefined
    {
      try {
        const payload: unknown = await response.json()
        if (typeof payload === 'object' && payload !== null) {
          if (response.status === 403 && 'code' in payload && payload.code === 'ACCOUNT_SUSPENDED') {
            if (
              options.viewerId &&
              typeof window !== 'undefined' &&
              typeof window.dispatchEvent === 'function'
            )
              window.dispatchEvent(
                new CustomEvent('rollcall:account-suspended', { detail: { viewerId: options.viewerId } }),
              )
            throw new HttpError(
              403,
              'Your RollCall application access is suspended.',
              {},
              'ACCOUNT_SUSPENDED',
            )
          }
          if ('code' in payload && payload.code === errorCodes[response.status]) code = payload.code
          if (
            resource === 'event' &&
            response.status === 409 &&
            'message' in payload &&
            typeof payload.message === 'string' &&
            eventConflicts.has(payload.message)
          )
            conflict = payload.message
          if (
            [400, 409, 413, 415].includes(response.status) &&
            'fields' in payload &&
            typeof payload.fields === 'object' &&
            payload.fields !== null
          ) {
            for (const [key, value] of Object.entries(payload.fields).slice(0, 50)) {
              if (
                /^(?:[A-Za-z][A-Za-z0-9_.]{0,79}|_form)$/.test(key) &&
                Array.isArray(value) &&
                value.length <= 10 &&
                value.every((message) => typeof message === 'string' && message.length <= 500)
              )
                fields[key] = value
            }
          }
        }
      } catch (error) {
        if (error instanceof HttpError && error.code === 'ACCOUNT_SUSPENDED') throw error
        /* Malformed error bodies never replace a safe message. */
      }
    }
    throw new HttpError(
      response.status,
      conflict ??
        (response.status === 429
          ? 'Too many attempts. Try again later.'
          : response.status === 401
            ? 'Your session could not be verified. Log in again to continue.'
            : response.status === 404
              ? resource === 'event'
                ? 'This event could not be found or is not available to this account.'
                : 'This profile or game could not be found.'
              : [400, 413, 415].includes(response.status)
                ? 'Check the highlighted fields and try again.'
                : response.status === 409
                  ? 'This event changed or is no longer available. Check the latest details and try again.'
                  : response.status === 403 && resource === 'event'
                    ? 'This account does not have access to this event.'
                    : `The ${resource} service could not complete this request. Please try again.`),
      fields,
      code,
    )
  }
  try {
    const payload: unknown = response.status === 204 ? undefined : await response.json()
    const result = schema.safeParse(payload)
    if (result.success) return result.data
  } catch {
    /* Treat malformed JSON like an invalid response contract. */
  }
  throw new Error(`The ${resource} service returned unexpected data. Please try again.`)
}
