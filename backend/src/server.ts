import { buildApp } from './app.js'
import { loadEnvironment } from './config/env.js'

async function start(): Promise<void> {
  const env = loadEnvironment()
  const app = buildApp(env)
  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    try {
      await app.close()
    } catch {
      app.log.error('Graceful shutdown failed')
      process.exitCode = 1
    }
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch {
    app.log.error('Unable to start RollCall API; check HOST, PORT, and local port availability')
    process.exitCode = 1
    await shutdown()
  }
}

start().catch((error: unknown) => {
  // Only configuration errors emitted here have deliberately sanitized messages.
  console.error(
    error instanceof Error && error.message.startsWith('Invalid backend configuration:')
      ? error.message
      : 'Unable to initialize RollCall API. Check backend configuration.',
  )
  process.exitCode = 1
})
