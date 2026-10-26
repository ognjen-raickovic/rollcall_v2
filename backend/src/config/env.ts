import { z } from 'zod'

const integer = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback)

function isUnprivilegedKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true
  // Decoding checks configuration only; this does not verify a user's identity.
  try {
    const payload = key.split('.')[1]
    if (!payload) return false
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return z.object({ role: z.literal('anon') }).safeParse(claims).success
  } catch {
    return false
  }
}

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    PORT: integer(1, 65535, 3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SUPABASE_URL: z.url().refine((value) => {
      const url = new URL(value)
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      )
    }, 'Use an HTTP(S) Supabase project origin without credentials or a path.'),
    SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .trim()
      .min(1)
      .refine(isUnprivilegedKey, 'Use a publishable or legacy anon key; privileged keys are not permitted.'),
    SUPABASE_TIMEOUT_MS: integer(100, 30000, 5000),
    EVENT_COVER_OPERATION_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43,128}$/)
      .optional(),
    CITY_SEARCH_DEFAULT_LIMIT: integer(1, 20, 4),
    CITY_SEARCH_MAX_LIMIT: integer(1, 20, 20),
  })
  .refine((value) => value.CITY_SEARCH_DEFAULT_LIMIT <= value.CITY_SEARCH_MAX_LIMIT, {
    path: ['CITY_SEARCH_DEFAULT_LIMIT'],
    message: 'Default city limit must not exceed the maximum.',
  })

export type Environment = z.infer<typeof environmentSchema>

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'environment'))]
    // Never include rejected values, keys, URLs, or the original Zod error in logs.
    throw new Error(`Invalid backend configuration: ${fields.join(', ')}. See backend/.env.example.`)
  }
  return result.data
}
