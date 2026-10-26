import sharp from 'sharp'
import { ApiError } from '../../shared/api-error.js'

export const MAX_COVER_BYTES = 3 * 1024 * 1024
const MAX_SOURCE_PIXELS = 16_000_000
const MAX_SOURCE_EDGE = 8192
const formats: Record<string, { format: string; extensions: readonly string[] }> = {
  'image/jpeg': { format: 'jpeg', extensions: ['jpg', 'jpeg'] },
  'image/png': { format: 'png', extensions: ['png'] },
  'image/webp': { format: 'webp', extensions: ['webp'] },
}
let processing = 0

export type CoverSource = {
  buffer: Buffer
  mimeType: string
  filename: string
}

export function invalidCover(message: string, status = 400): ApiError {
  return new ApiError(status, 'VALIDATION_ERROR', message, {
    image: [message],
  })
}

function matchesImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  return (
    mime === 'image/webp' &&
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
}

export async function prepareEventCover(source: CoverSource): Promise<Buffer> {
  if (source.buffer.length > MAX_COVER_BYTES) throw invalidCover('Choose an image no larger than 3 MiB.', 413)
  const expected = formats[source.mimeType]
  const extension = source.filename.split('.').at(-1)?.toLowerCase()
  if (!expected || !extension || !expected.extensions.includes(extension))
    throw invalidCover('Choose a JPEG, PNG or WebP image with a matching file type.')
  if (!source.buffer.length) throw invalidCover('The image is empty or damaged.')
  // Reject unsupported containers before invoking a general image loader, then
  // independently decode/re-encode the accepted raster format below.
  if (!matchesImageSignature(source.buffer, source.mimeType))
    throw invalidCover('The image content does not match its JPEG, PNG or WebP file type.')
  if (processing >= 2)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Image processing is busy. Try again shortly.')
  processing += 1
  try {
    const inputOptions = {
      limitInputPixels: MAX_SOURCE_PIXELS,
      failOn: 'warning' as const,
      sequentialRead: true,
    }
    const metadata = await sharp(source.buffer, inputOptions).timeout({ seconds: 5 }).metadata()
    if (
      metadata.format !== expected.format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_SOURCE_EDGE ||
      metadata.height > MAX_SOURCE_EDGE ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalidCover('Choose a valid still image within 8192 pixels per side and 16 megapixels.')
    // Re-encoding removes original filenames/EXIF and validates the decoded pixels.
    // No withMetadata/keepMetadata call: only normalized pixels enter Storage.
    const encoded = await sharp(source.buffer, inputOptions)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .timeout({ seconds: 5 })
      .toBuffer()
    if (encoded.length > MAX_COVER_BYTES)
      throw invalidCover('The processed image is too large. Choose a simpler or smaller image.')
    return encoded
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw invalidCover('The image could not be decoded. Choose an undamaged JPEG, PNG or WebP image.')
  } finally {
    processing -= 1
  }
}
