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

export const SELECTABLE_EVENT_TAGS = EVENT_TAGS.filter(
  (tag) => tag !== 'Beginner friendly' && tag !== 'Veterans only',
)
export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  'all-levels': 'All levels',
  'intermediate-plus': 'Intermediate+',
  'veteran-plus': 'Veteran+',
  beginner: 'Beginner (legacy)',
  experienced: 'Experienced (legacy)',
}
export function tagConflict(tags: readonly string[]): string | null {
  if (tags.includes('Casual') && tags.includes('Competitive'))
    return 'Casual and Competitive cannot be selected together.'
  if (tags.includes('One-shot') && tags.includes('Campaign'))
    return 'Choose either One-shot or Campaign, not both.'
  return null
}
