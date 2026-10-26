export const MAX_EVENT_IMAGE_BYTES = 3 * 1024 * 1024
export const EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_DATA_URL_LENGTH = 4 * Math.ceil(MAX_EVENT_IMAGE_BYTES / 3) + 32

const covers: Record<string, string> = {
  'role-playing': '/images/role-playing.svg',
  'trading-card': '/images/trading-card.svg',
  'board-game': '/images/board-games.svg',
  'social-deduction': '/images/social-deduction.svg',
}

export function eventCover(category: string | undefined): string {
  return covers[category ?? ''] ?? '/images/board-games.svg'
}

export function customEventCover(src: string | null): string | null {
  return src && !Object.values(covers).includes(src) ? src : null
}

function hasImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  return (
    mime === 'image/webp' &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
}

// A bounded, serializable mock representation; never an object URL or durable storage.
export function validEventImageDataUrl(value: string): boolean {
  if (value.length > MAX_DATA_URL_LENGTH) return false
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) return false
  const mime = match[1]
  const encoded = match[2]
  if (!mime || !encoded || encoded.length % 4 !== 0) return false
  const size = (encoded.length / 4) * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
  if (size < 12 || size > MAX_EVENT_IMAGE_BYTES) return false
  try {
    return hasImageSignature(
      Uint8Array.from(atob(encoded.slice(0, 16)), (char) => char.charCodeAt(0)),
      mime,
    )
  } catch {
    return false
  }
}

export async function prepareEventCover(file: File): Promise<string> {
  const extensions: Record<string, RegExp> = {
    'image/jpeg': /\.jpe?g$/i,
    'image/png': /\.png$/i,
    'image/webp': /\.webp$/i,
  }
  if (!extensions[file.type]?.test(file.name)) throw new Error('Choose a JPG, PNG, or WebP image.')
  if (file.size > MAX_EVENT_IMAGE_BYTES) throw new Error('Choose an image of 3 MB or less.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!hasImageSignature(bytes, file.type))
    throw new Error('This file is not a valid JPG, PNG, or WebP image.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This image could not be opened. Choose another JPG, PNG, or WebP image.')
  }
  const canvas = document.createElement('canvas')
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 16000000)
      throw new Error('Choose an image no larger than 8192 pixels per edge and 16 megapixels.')
    // Bound the retained image, preserve its ratio, and never upscale a small cover.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image processing is unavailable. Please try another browser.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob || blob.size > MAX_EVENT_IMAGE_BYTES)
      throw new Error('This image could not be prepared within 3 MB. Choose a smaller image.')
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Image reading failed.'))
      reader.onerror = () => reject(new Error('Image reading failed. Please select the image again.'))
      reader.onabort = () => reject(new Error('Image reading was interrupted. Please try again.'))
      reader.readAsDataURL(blob)
    })
    if (!validEventImageDataUrl(dataUrl))
      throw new Error('This image could not be prepared. Try another image.')
    return dataUrl
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}
