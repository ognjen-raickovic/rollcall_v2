// Layer boundary check: shared (components, lib, hooks) -> features -> app.
// Runs as part of `pnpm lint`. No dependencies, just Node.
//
// Rules:
// 1. A feature does not import another feature (src/features/X does not import from src/features/Y).
// 2. Shared code (src/components, src/lib, src/hooks) does not import from src/features or src/app.
// 3. A feature does not import from src/app.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const SHARED = ['components', 'lib', 'hooks']

// import x from '...', import '...', export ... from '...', import('...')
const IMPORT_REGEX =
  /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function allFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return allFiles(fullPath)
    return /\.tsx?$/.test(entry.name) ? [fullPath] : []
  })
}

// Returns the path relative to src/ with "/" separators (also on Windows), or null if it is outside src/.
function inSrc(absolutePath) {
  const relative = path.relative(SRC, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative.split(path.sep).join('/')
}

function target(file, specifier) {
  if (specifier.startsWith('@/')) return inSrc(path.join(SRC, specifier.slice(2)))
  if (specifier.startsWith('.')) return inSrc(path.resolve(path.dirname(file), specifier))
  return null // package from node_modules
}

function area(pathInSrc) {
  const [first, second] = pathInSrc.split('/')
  if (first === 'features') return { layer: 'features', feature: second }
  if (first === 'app') return { layer: 'app' }
  if (SHARED.includes(first)) return { layer: 'shared' }
  return { layer: 'other' }
}

function violation(from, to) {
  if (from.layer === 'features' && to.layer === 'features' && from.feature !== to.feature) {
    return `feature "${from.feature}" must not import from feature "${to.feature}". Move shared code to src/lib or src/components, and combine the features in a route (src/app/routes).`
  }
  if (from.layer === 'shared' && (to.layer === 'features' || to.layer === 'app')) {
    return `shared code (src/components, src/lib, src/hooks) must not import from src/${to.layer}.`
  }
  if (from.layer === 'features' && to.layer === 'app') {
    return 'a feature must not import from src/app. Routes use features, never the other way around.'
  }
  return null
}

const errors = []

for (const file of allFiles(SRC)) {
  const from = area(inSrc(file))
  const code = readFileSync(file, 'utf8')
  for (const match of code.matchAll(IMPORT_REGEX)) {
    const specifier = match[1] ?? match[2]
    const resolved = target(file, specifier)
    if (!resolved) continue
    const message = violation(from, area(resolved))
    if (message) errors.push(`  src/${inSrc(file)}\n    import '${specifier}'\n    -> ${message}`)
  }
}

if (errors.length > 0) {
  console.error(`\nBoundary check failed (${errors.length}):\n\n${errors.join('\n\n')}\n`)
  process.exit(1)
}

console.log('Boundary check: all good.')
