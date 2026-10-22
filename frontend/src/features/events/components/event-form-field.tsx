import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

type EventFormFieldProps = {
  name: string
  label: string
  required?: boolean
  help?: string
  error?: string
  children: (attributes: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}

export function EventFormField({
  name,
  label,
  required = false,
  help,
  error,
  children,
}: EventFormFieldProps) {
  const id = `event-${name}`
  const describedBy =
    [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-primary">
            *
          </span>
        )}
      </Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {help && (
        <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
