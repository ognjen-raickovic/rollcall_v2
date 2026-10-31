import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCorrectUsername } from '../api/use-profiles'

type UsernameCasingFormProps = { username: string }

export function UsernameCasingForm({ username }: UsernameCasingFormProps) {
  const [value, setValue] = useState(username)
  const [expected, setExpected] = useState(username)
  const save = useCorrectUsername()
  const valid = /^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(value) && value.toLowerCase() === expected.toLowerCase()
  return (
    <form
      className="mt-6 space-y-4 rounded-xl border bg-card p-6 md:p-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid && value !== expected && !save.isPending)
          save.mutate({ username: value, expected }, { onSuccess: () => setExpected(value) })
      }}
    >
      <h2 className="text-xl font-semibold">Username capitalization</h2>
      <p className="text-sm text-muted-foreground">
        Correct the spelling's capitalization only. Your username identity stays the same.
      </p>
      <Label htmlFor="username-casing">Username</Label>
      <Input
        id="username-casing"
        value={value}
        maxLength={24}
        disabled={save.isPending}
        onChange={(event) => {
          setValue(event.target.value)
          save.reset()
        }}
        aria-invalid={!valid}
      />
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          Keep the same letters, numbers and underscores; only change letter case.
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message} Reload if the stored spelling changed.
        </p>
      )}
      <Button disabled={!valid || value === expected || save.isPending}>
        {save.isPending ? 'Updating...' : 'Update capitalization'}
      </Button>
    </form>
  )
}
