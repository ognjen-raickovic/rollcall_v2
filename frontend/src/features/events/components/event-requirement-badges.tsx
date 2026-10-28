import { EXPERIENCE_LABELS } from '../event-tags'
import type { ExperienceLevel } from '../types'

type EventRequirementBadgesProps = { experienceLevel?: ExperienceLevel; minimumAge?: number }

export function EventRequirementBadges({ experienceLevel, minimumAge }: EventRequirementBadgesProps) {
  if (!experienceLevel && !(minimumAge && minimumAge > 0)) return null
  return (
    <div className="flex flex-wrap gap-2 text-xs font-medium">
      {experienceLevel && (
        <span
          className="rounded-md bg-accent px-2 py-1 text-accent-foreground"
          aria-label={`Recommended experience: ${EXPERIENCE_LABELS[experienceLevel]}`}
        >
          {EXPERIENCE_LABELS[experienceLevel]}
        </span>
      )}
      {minimumAge !== undefined && minimumAge > 0 && (
        <span
          className="rounded-md border bg-secondary px-2 py-1 text-secondary-foreground"
          aria-label={`Minimum age ${minimumAge}`}
        >
          {minimumAge}+
        </span>
      )}
    </div>
  )
}
