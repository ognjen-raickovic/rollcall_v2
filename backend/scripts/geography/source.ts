import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { MAX_TEXT_BYTES, MAX_ZIP_BYTES, SOURCE_BASE_URL } from './config.js'
import type { CountryCode } from './config.js'

export type SourceInfo = {
  country: CountryCode
  sourceUrl: string
  file: string
  sha256: string
  textSha256: string
  bytes: number
  textBytes: number
  downloadedAt: string | null
  lastModified: string | null
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function checksum(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function decodeCountryZip(bytes: Uint8Array, country: CountryCode): Uint8Array {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error(`${country}: ZIP exceeds the 50 MiB limit.`)
  const expected = `${country}.txt`
  let oversized = false
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (file.name !== expected) return false
      oversized = file.originalSize > MAX_TEXT_BYTES
      return !oversized
    },
  })
  const text = files[expected]
  if (oversized || !text || text.byteLength > MAX_TEXT_BYTES) {
    throw new Error(`${country}: ZIP must contain a bounded ${expected} file at its root.`)
  }
  return text
}

export async function loadCountrySource(
  directory: string,
  country: CountryCode,
  options: { download: boolean; refresh: boolean },
): Promise<{ text: string; info: SourceInfo }> {
  const textFile = path.join(directory, `${country}.txt`)
  const zipFile = path.join(directory, `${country}.zip`)
  await mkdir(directory, { recursive: true })
  const hasText = await exists(textFile)
  if (hasText && options.refresh)
    throw new Error(
      `${country}: --refresh will not replace a supplied local text file; use a separate download directory.`,
    )
  let downloadInfo: { downloadedAt: string; lastModified: string | null } | undefined
  if (!hasText && (options.refresh || !(await exists(zipFile)))) {
    if (!options.download)
      throw new Error(
        `${country}: no ${country}.txt or ZIP found. Supply all four local files or use --download.`,
      )
    const response = await fetch(`${SOURCE_BASE_URL}${country}.zip`, {
      signal: AbortSignal.timeout(120000),
      redirect: 'error',
    })
    if (!response.ok || !response.body)
      throw new Error(`${country}: GeoNames download failed with status ${response.status}.`)
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > MAX_ZIP_BYTES) throw new Error(`${country}: download exceeds the 50 MiB limit.`)
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    decodeCountryZip(bytes, country)
    const temporary = `${zipFile}.${randomUUID()}.tmp`
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, zipFile)
    downloadInfo = {
      downloadedAt: new Date().toISOString(),
      lastModified: response.headers.get('last-modified'),
    }
    await writeFile(
      `${zipFile}.source.json`,
      JSON.stringify({ ...downloadInfo, sha256: checksum(bytes) }, null, 2) + '\n',
    )
  }
  const file = hasText ? textFile : zipFile
  const fileStats = await stat(file)
  if (fileStats.size > (hasText ? MAX_TEXT_BYTES : MAX_ZIP_BYTES))
    throw new Error(`${country}: input file exceeds the supported size.`)
  const bytes = await readFile(file)
  const textBytes = hasText ? bytes : decodeCountryZip(bytes, country)
  if (!downloadInfo && !hasText && (await exists(`${zipFile}.source.json`))) {
    const metadata: unknown = JSON.parse(await readFile(`${zipFile}.source.json`, 'utf8'))
    if (
      typeof metadata === 'object' &&
      metadata !== null &&
      'sha256' in metadata &&
      metadata.sha256 === checksum(bytes) &&
      'downloadedAt' in metadata &&
      typeof metadata.downloadedAt === 'string' &&
      'lastModified' in metadata &&
      (metadata.lastModified === null || typeof metadata.lastModified === 'string')
    ) {
      downloadInfo = { downloadedAt: metadata.downloadedAt, lastModified: metadata.lastModified }
    }
  }
  return {
    text: new TextDecoder('utf-8', { fatal: true }).decode(textBytes),
    info: {
      country,
      sourceUrl: `${SOURCE_BASE_URL}${country}.zip`,
      file: path.basename(file),
      sha256: checksum(bytes),
      textSha256: checksum(textBytes),
      bytes: bytes.byteLength,
      textBytes: textBytes.byteLength,
      downloadedAt: downloadInfo?.downloadedAt ?? null,
      lastModified: downloadInfo?.lastModified ?? null,
    },
  }
}
