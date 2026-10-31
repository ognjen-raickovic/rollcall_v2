import { useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { LockKeyhole, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatAccountDate } from '@/lib/account-date'
import { FormSelect } from '@/components/form-select'
import { HttpError } from '@/lib/http-client'
import { locationReferenceSchema, type LocationReference } from '@/lib/location'
import { useUpdateProfile } from '../api/use-profiles'
import type { OwnProfile } from '../types'

export type ProfileLocationSlotProps = {
  countryId: number | null
  value: LocationReference | null
  onCountryChange: (countryId: number | null) => void
  onChange: (value: LocationReference | null) => void
  onQueryChange: (query: string) => void
  disabled: boolean
  error?: string
}

const currentYear = new Date().getUTCFullYear()
const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters.')
    .max(80, 'Use at most 80 characters.')
    .refine(
      (name) => !Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
      'Use a display name without control characters.',
    ),
  biography: z.string().trim().max(500, 'Use at most 500 characters.'),
  countryId: z.number().int().positive().nullable(),
  location: locationReferenceSchema.nullable(),
  birthYear: z
    .number()
    .int()
    .min(1900, 'Choose a birth year from 1900 onward.')
    .max(currentYear, 'Birth year cannot be in the future.')
    .nullable(),
})

type ProfileFormProps = {
  profile: OwnProfile
  renderLocation: (props: ProfileLocationSlotProps) => ReactNode
}

export function ProfileForm({ profile, renderLocation }: ProfileFormProps) {
  const update = useUpdateProfile()
  const navigate = useNavigate()
  const [unconfirmedCity, setUnconfirmedCity] = useState(false)
  const initialLocation: LocationReference | null =
    profile.country && profile.city
      ? {
          cityId: profile.city.id,
          countryId: profile.country.id,
          countryIsoCode: profile.country.isoCode,
          countryName: profile.country.name,
          cityName: profile.city.name,
          administrativeDivision: profile.city.administrativeDivision,
          admin1Code: profile.city.admin1Code,
          admin2Code: profile.city.admin2Code,
        }
      : null
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      displayName: profile.displayName,
      biography: profile.biography ?? '',
      countryId: profile.country?.id ?? null,
      location: initialLocation,
      birthYear: profile.birthYear,
    },
  })

  const normalize = (values: z.infer<typeof schema>) => ({
    displayName: values.displayName.trim(),
    biography: values.biography.trim(),
    countryId: values.countryId,
    cityId: values.location?.cityId ?? null,
    birthYear: profile.hasDateOfBirth ? null : values.birthYear,
  })
  const [baseline] = useState(() => normalize(form.getValues()))
  const parsed = schema.safeParse(form.watch())
  const dirty = parsed.success && JSON.stringify(normalize(parsed.data)) !== JSON.stringify(baseline)
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={form.handleSubmit((values) => {
        if (!dirty || update.isPending) return
        if (unconfirmedCity) {
          form.setError('location', { message: 'Choose a city suggestion or clear the city field.' })
          return
        }
        update.mutate(
          {
            displayName: values.displayName,
            biography: values.biography || null,
            countryId: values.countryId,
            cityId: values.location?.cityId ?? null,
            birthYear: profile.hasDateOfBirth ? undefined : values.birthYear,
          },
          {
            onSuccess: () => {
              void navigate('/profile')
            },
            onError: (error) => {
              if (error instanceof HttpError) {
                for (const [name, messages] of Object.entries(error.fields)) {
                  const field = name === 'cityId' ? 'location' : name
                  if (['displayName', 'biography', 'countryId', 'location', 'birthYear'].includes(field))
                    form.setError(field as keyof z.infer<typeof schema>, {
                      message: messages[0] ?? 'Check this field.',
                    })
                }
              }
            },
          },
        )
      })}
    >
      <fieldset disabled={update.isPending} className="min-w-0 space-y-6">
        <section className="space-y-6 rounded-xl border bg-card p-6 md:p-8">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">The player behind the games</h2>
            <p className="text-sm text-muted-foreground">
              Your name, biography and location appear on your public profile. Location is optional.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-display-name">
              Display name{' '}
              <span aria-hidden="true" className="text-primary">
                *
              </span>
            </Label>
            <Input
              id="profile-display-name"
              autoComplete="nickname"
              maxLength={80}
              aria-invalid={Boolean(form.formState.errors.displayName)}
              aria-describedby={form.formState.errors.displayName ? 'profile-name-error' : undefined}
              {...form.register('displayName')}
            />
            {form.formState.errors.displayName && (
              <p id="profile-name-error" className="text-sm text-destructive">
                {form.formState.errors.displayName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-biography">Biography</Label>
            <Textarea
              id="profile-biography"
              rows={4}
              maxLength={500}
              placeholder="Your favorite games, the tables you enjoy, or a little about you."
              aria-invalid={Boolean(form.formState.errors.biography)}
              aria-describedby="profile-bio-help"
              {...form.register('biography')}
            />
            <p id="profile-bio-help" className="text-xs text-muted-foreground">
              Optional · Up to 500 characters. Avoid sharing private contact details.
            </p>
            {form.formState.errors.biography && (
              <p className="text-sm text-destructive">{form.formState.errors.biography.message}</p>
            )}
          </div>
          <Controller
            name="location"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                {renderLocation({
                  countryId: form.watch('countryId'),
                  value: field.value,
                  disabled: update.isPending,
                  error: fieldState.error?.message ?? form.formState.errors.countryId?.message,
                  onCountryChange: (countryId) => {
                    form.setValue('countryId', countryId, { shouldDirty: true })
                    field.onChange(null)
                    setUnconfirmedCity(false)
                    form.clearErrors(['location', 'countryId'])
                  },
                  onChange: (value) => {
                    field.onChange(value)
                    if (value) {
                      form.setValue('countryId', value.countryId, { shouldDirty: true })
                      setUnconfirmedCity(false)
                      form.clearErrors('location')
                    }
                  },
                  onQueryChange: (query) => {
                    setUnconfirmedCity(Boolean(query.trim()))
                    form.clearErrors('location')
                  },
                })}
              </>
            )}
          />
          <p className="text-xs text-muted-foreground">
            City is optional. Leave it blank or choose a suggestion; changing country clears the city.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t pt-6">
            <p className="text-sm font-medium">Account created</p>
            <p className="text-sm text-muted-foreground">{formatAccountDate(profile.createdAt)}</p>
          </div>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-6 md:p-8">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
            Private age information
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {profile.hasDateOfBirth
              ? 'Your birth year comes from your private registration date and cannot be changed here. Your full date of birth is never shown publicly.'
              : 'This optional birth year is visible only to you. It is self-declared, not verified, and is never shown on your public profile.'}
          </p>
          <div className="space-y-2">
            <Label htmlFor="profile-birth-year">Birth year (private)</Label>
            {profile.hasDateOfBirth ? (
              <Input id="profile-birth-year" readOnly value={profile.birthYear ?? ''} />
            ) : (
              <FormSelect
                id="profile-birth-year"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-invalid={Boolean(form.formState.errors.birthYear)}
                {...form.register('birthYear', {
                  setValueAs: (value) => (value === '' || value == null ? null : Number(value)),
                })}
              >
                <option value="">Prefer not to say</option>
                {Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </FormSelect>
            )}
            {form.formState.errors.birthYear && (
              <p className="text-sm text-destructive">{form.formState.errors.birthYear.message}</p>
            )}
          </div>
        </section>
      </fieldset>
      {update.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
        >
          {update.error.message} Your changes are still in the form.
        </p>
      )}
      {Object.keys(form.formState.errors).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Please check the highlighted fields before saving.
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <Button type="submit" disabled={!dirty || unconfirmedCity || update.isPending}>
          <Save aria-hidden="true" />
          {update.isPending ? 'Saving changes...' : 'Save changes'}
        </Button>
        <Button asChild variant="outline">
          <Link to="/profile">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
