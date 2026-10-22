import { useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { ApiError } from '@/lib/mock-db'

import { eventCover, eventFormDefaults, eventFormSchema } from '../api/event-form-values'
import type { EventFormValues } from '../api/event-form-values'
import { useCreateEvent, useUpdateEvent } from '../api/use-events'
import type { Event, NewEvent } from '../types'

type UseEventFormOptions = { event?: Event; currentUserId: number; games: { id: number; category: string }[] }

export function useEventForm({ event, currentUserId, games }: UseEventFormOptions) {
  const saving = useRef(false)
  const navigate = useNavigate()
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const schema = eventFormSchema.superRefine((values, context) => {
    if (event && values.capacity < event.attendeeIds.length)
      context.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: `Keep at least ${event.attendeeIds.length} seats for the players already attending.`,
      })
    if (!games.some((game) => game.id === values.gameId))
      context.addIssue({
        code: 'custom',
        path: ['gameId'],
        message: 'Choose a game from the available catalog.',
      })
  })
  const form = useForm<EventFormValues, unknown, NewEvent>({
    resolver: zodResolver(schema),
    defaultValues: eventFormDefaults(event),
    reValidateMode: 'onChange',
  })
  const pending = create.isPending || update.isPending || form.formState.isSubmitting

  const submit = form.handleSubmit(async (values) => {
    if (saving.current) return
    saving.current = true
    form.clearErrors('root')
    const game = games.find((item) => item.id === values.gameId)
    const input: NewEvent = {
      ...values,
      imageUrl: event && event.gameId === values.gameId ? event.imageUrl : eventCover(game?.category),
    }
    try {
      const actor = { userId: currentUserId }
      const saved = event
        ? await update.mutateAsync({ id: event.id, changes: input, actor })
        : await create.mutateAsync({ input, actor })
      await navigate(`/events/${saved.id}`, {
        replace: true,
        state: {
          eventNotice: event
            ? 'Your event has been updated.'
            : 'Your event is ready. Share the table with your players.',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We couldn’t save the event. Please try again.'
      form.setError('root.server', { message })
      if (error instanceof ApiError) {
        const currentValues = form.getValues()
        let firstField: keyof EventFormValues | undefined
        for (const [field, messages] of Object.entries(error.fields)) {
          const name = field.split('.')[0]
          if (name in currentValues) {
            const key = name as keyof EventFormValues
            form.setError(key, { message: messages.join(' ') })
            firstField ??= key
          }
        }
        if (firstField) form.setFocus(firstField)
      }
    } finally {
      saving.current = false
    }
  })
  return { form, submit, pending }
}
