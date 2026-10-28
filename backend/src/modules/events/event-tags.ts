// Shared product vocabulary, implemented independently of the numeric frontend mocks.
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

export function tagsMatchExperience(tags: readonly string[], experience: string): boolean {
  return (
    !(tags.includes('Casual') && tags.includes('Competitive')) &&
    !(tags.includes('One-shot') && tags.includes('Campaign')) &&
    !(tags.includes('Beginner friendly') && tags.includes('Veterans only')) &&
    (!tags.includes('Beginner friendly') || experience !== 'experienced') &&
    (!tags.includes('Veterans only') || experience === 'experienced')
  )
}
