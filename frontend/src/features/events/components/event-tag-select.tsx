import type { Ref } from 'react'
import { useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Popover } from 'radix-ui'

import { Button } from '@/components/ui/button'

import { EVENT_TAGS, tagMatchesExperience } from '../event-tags'
import type { EventTag } from '../event-tags'
import type { ExperienceLevel } from '../types'

type EventTagSelectProps = {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
  inputRef: Ref<HTMLButtonElement>
  value: EventTag[]
  experience: ExperienceLevel
  disabled: boolean
  onChange: (tags: EventTag[]) => void
}

export function EventTagSelect({
  inputRef,
  value,
  experience,
  disabled,
  onChange,
  ...attributes
}: EventTagSelectProps) {
  const trigger = useRef<HTMLButtonElement | null>(null)
  return (
    <div className="space-y-3">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            {...attributes}
            ref={(element) => {
              trigger.current = element
              if (typeof inputRef === 'function') inputRef(element)
              else if (inputRef) inputRef.current = element
            }}
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-11 w-full justify-between bg-background"
          >
            {value.length ? `${value.length} of 6 tags selected` : 'Select tags (optional)'}
            <ChevronDown aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-md"
            aria-label="Event tags"
          >
            <fieldset className="space-y-3" disabled={disabled}>
              <legend className="mb-3 text-sm font-semibold">Choose up to six tags</legend>
              {EVENT_TAGS.map((tag) => {
                const checked = value.includes(tag)
                const incompatible = !tagMatchesExperience(tag, experience)
                const unavailable = !checked && (value.length >= 6 || incompatible)
                return (
                  <label
                    key={tag}
                    className="flex min-h-9 cursor-pointer items-center gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={unavailable}
                      className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onChange={() =>
                        onChange(checked ? value.filter((item) => item !== tag) : [...value, tag])
                      }
                    />
                    {tag}
                  </label>
                )
              })}
            </fieldset>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Experience level controls availability. Veterans only requires Experienced players; Beginner
              friendly is unavailable for that level.
            </p>
            <Popover.Close asChild>
              <Button type="button" size="sm" variant="outline" className="mt-4 w-full">
                Done
              </Button>
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {value.length > 0 && (
        <ul aria-label="Selected event tags" className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-md border bg-accent py-1 pr-1 pl-3 text-sm text-accent-foreground"
            >
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((item) => item !== tag))
                  trigger.current?.focus()
                }}
                aria-label={`Remove ${tag} tag`}
                className="flex size-8 items-center justify-center rounded-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
