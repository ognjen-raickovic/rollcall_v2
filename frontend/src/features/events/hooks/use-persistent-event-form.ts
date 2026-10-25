import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { HttpError } from '@/lib/http-client'
import { persistentEventFormDefaults, persistentEventFormSchema } from '../api/persistent-event-form-values'
import type { EventFormValues } from '../api/event-form-values'
import type { CreateEventInput, HostEventDetails } from '../api/event-write-dtos'
import type { EventActionSession } from '../api/persistent-event-actions-api'
import { usePersistentCreateEvent, usePersistentUpdateEvent } from '../api/use-persistent-event-actions'

type UsePersistentEventFormOptions = {
  event?: HostEventDetails
  session: EventActionSession
  games: { id: number; category: string }[]
}

export function usePersistentEventForm({ event, session, games }: UsePersistentEventFormOptions) {
  const initialEvent = useRef(event).current
  const navigate = useNavigate()
  const mounted = useRef(true)
  const saving = useRef(false)
  const [requiresLogin, setRequiresLogin] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const create = usePersistentCreateEvent(session)
  const update = usePersistentUpdateEvent(session)
  const schema = persistentEventFormSchema(initialEvent).superRefine((value, context) => {
    if (!games.some((game) => game.id === value.gameId))
      context.addIssue({
        code: 'custom',
        path: ['gameId'],
        message: 'Choose a game from the available catalog.',
      })
  })
  const form = useForm<EventFormValues, unknown, CreateEventInput>({
    resolver: zodResolver(schema),
    defaultValues: persistentEventFormDefaults(initialEvent),
    reValidateMode: 'onChange',
  })
  const pending = create.isPending || update.isPending || form.formState.isSubmitting
  const submit = form.handleSubmit(async (input) => {
    if (saving.current) return
    saving.current = true
    setRequiresLogin(false)
    form.clearErrors('root')
    try {
      const saved = event
        ? await update.mutateAsync({ id: event.id, input })
        : await create.mutateAsync(input)
      await session.getAccessToken()
      if (!mounted.current) return
      await navigate(`/events/${saved.id}`, {
        replace: true,
        state: {
          eventNotice: event ? 'Your event has been updated.' : 'Your event has been created.',
        },
      })
    } catch (error) {
      if (!mounted.current) return
      setRequiresLogin(error instanceof HttpError && error.status === 401)
      form.setError('root.server', {
        message:
          error instanceof HttpError && error.fields._form?.length
            ? error.fields._form.join(' ')
            : error instanceof Error
              ? error.message
              : 'The event could not be saved. Please try again.',
      })
      if (error instanceof HttpError) {
        const values = form.getValues()
        let first: keyof EventFormValues | undefined
        for (const [field, messages] of Object.entries(error.fields)) {
          const name = field === 'cityId' ? 'location' : field.split('.')[0]
          if (name && name in values) {
            const key = name as keyof EventFormValues
            form.setError(key, { message: messages.join(' ') })
            first ??= key
          }
        }
        if (first) form.setFocus(first)
      }
    } finally {
      saving.current = false
    }
  })
  return { form, submit, pending, requiresLogin }
}
