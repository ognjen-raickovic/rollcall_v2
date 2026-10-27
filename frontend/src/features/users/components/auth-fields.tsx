import type { UseFormRegisterReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'

type AuthFieldProps = {
  label: string
  id: string
  type: 'email' | 'password' | 'text' | 'date'
  autoComplete: string
  registration: UseFormRegisterReturn
  error?: string
}

export function AuthField({ label, id, type, autoComplete, registration, error }: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...registration}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
