import type { ZodType } from 'zod'

// Geography is the only HTTP-backed feature in this milestone.

export function apiOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid origin')
    return url.origin
  } catch {
    throw new Error('The location service address is invalid. Check VITE_API_ORIGIN.')
  }
}

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const origin = apiOrigin(import.meta.env.VITE_API_ORIGIN ?? '')
  let response: Response
  try {
    response = await fetch(`${origin}${path}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('The location service is unavailable. Check your connection and try again.')
  }
  if (!response.ok) throw new Error('The location service could not load these places. Please try again.')
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('The location service returned an unexpected response. Please try again.')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error('The location service returned unexpected data. Please try again.')
  return parsed.data
}
