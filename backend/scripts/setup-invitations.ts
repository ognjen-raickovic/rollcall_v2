import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

async function main() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.SUPABASE_URL ?? '').hostname))
    throw new Error('Invitation setup requires local Supabase.')
  const file = new URL('../.env', import.meta.url)
  const source = await readFile(file, 'utf8')
  const existing = /^EVENT_INVITATION_KEY=(.*)$/m.exec(source)?.[1]?.trim()
  if (existing) {
    if (process.env.EVENT_INVITATION_KEY && process.env.EVENT_INVITATION_KEY !== existing)
      throw new Error('Conflicting invitation key configuration.')
    if (!/^[A-Za-z0-9_-]{43}$/.test(existing))
      throw new Error('Resolve the invitation key privately; it was not rotated.')
  } else {
    const value = process.env.EVENT_INVITATION_KEY || randomBytes(32).toString('base64url')
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Invalid invitation key configuration.')
    const line = `EVENT_INVITATION_KEY=${value}\n`
    await writeFile(
      file,
      /^EVENT_INVITATION_KEY=.*$/m.test(source)
        ? source.replace(/^EVENT_INVITATION_KEY=.*(?:\r?\n|$)/m, line)
        : `${source}\n${line}`,
      { mode: 0o600 },
    )
  }
  console.log('Local invitation encryption configured. No key was printed or rotated.')
}
main().catch(() => {
  console.error('Invitation setup failed. Check local ignored configuration.')
  process.exitCode = 1
})
