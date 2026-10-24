import { loadEnvironment } from '../src/config/env.js'

export function testEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  return loadEnvironment({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SUPABASE_URL: 'http://127.0.0.1:55321',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only-not-a-real-key',
    ...overrides,
  })
}
