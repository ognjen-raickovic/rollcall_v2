// PostToolUse hook: after every file edit, runs Prettier on that file.
// A "format the code" rule in CLAUDE.md would be a request; this hook is a guarantee.
// Uses the local Prettier from frontend/node_modules (installed by `pnpm install`), no npx.
// Only formats files inside frontend/; the backend will bring its own formatter.
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(import.meta.dirname, '../..')
const frontend = path.join(root, 'frontend')
const prettier = path.join(frontend, 'node_modules', 'prettier', 'bin', 'prettier.cjs')

let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  try {
    const file = path.resolve(root, JSON.parse(input).tool_input?.file_path ?? '')
    const relative = path.relative(frontend, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return
    if (!/\.(tsx?|css|json|md)$/.test(file)) return
    execFileSync(process.execPath, [prettier, '--write', file], { cwd: frontend, stdio: 'ignore' })
  } catch {
    // A failed format must never stop the agent.
  }
})
