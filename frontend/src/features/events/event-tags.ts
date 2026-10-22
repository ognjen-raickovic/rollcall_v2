import type { ExperienceLevel } from './types'

export const EVENT_TAGS = [
  'Beginner friendly',
  'Veterans only',
  'Casual',
  'Competitive',
  'One-shot',
  'Campaign',
  'Bring your own deck',
  'Equipment provided',
] as const

export type EventTag = (typeof EVENT_TAGS)[number]

export function tagMatchesExperience(tag: EventTag, experience: ExperienceLevel): boolean {
  if (tag === 'Veterans only') return experience === 'experienced'
  if (tag === 'Beginner friendly') return experience !== 'experienced'
  return true
}
