import { z } from 'zod'

const fallbackImage = z.enum([
  '/images/role-playing.svg',
  '/images/trading-card.svg',
  '/images/board-games.svg',
  '/images/social-deduction.svg',
])

export const eventCoverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default'), imageUrl: fallbackImage }),
  z.object({
    kind: z.literal('custom'),
    version: z.uuid(),
    imageUrl: fallbackImage,
  }),
])
export const coverAssociationSchema = z.object({
  eventId: z.uuid(),
  cover: eventCoverSchema,
})
export const coverReservationSchema = z.object({
  eventId: z.uuid(),
  path: z.string(),
  version: z.uuid(),
})
export const readableCoverSchema = coverReservationSchema.extend({
  visibility: z.enum(['public', 'unlisted', 'private']),
})
export const coverUrlSchema = z.object({
  eventId: z.uuid(),
  version: z.uuid(),
  imageUrl: z.url(),
  expiresAt: z.iso.datetime(),
  visibility: z.enum(['public', 'unlisted', 'private']),
})
export type CoverReservation = z.infer<typeof coverReservationSchema>
export type CoverMutationResult = z.infer<typeof coverAssociationSchema> & {
  cleanupPending: boolean
}
export type CoverUrl = z.infer<typeof coverUrlSchema>
