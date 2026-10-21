// In-memory mock "database" shared by all features. Next workshop this file goes away,
// and the functions in src/features/<name>/api/ start calling the real backend.

const DELAY_MS = 400

export const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), DELAY_MS))

export class NotFoundError extends Error {
  constructor(resource: string, id: number) {
    super(`${resource} with id ${id} does not exist`)
  }
}
