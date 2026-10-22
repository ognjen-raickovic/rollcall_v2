import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { ApiError } from '@/lib/mock-db'

import { eventFormDefaults, eventFormSchema } from '../api/event-form-values'
import { eventCover } from '../api/event-covers'
import type { EventFormValues } from '../api/event-form-values'
import { useCreateEvent, useUpdateEvent } from '../api/use-events'
import type { Event, NewEvent } from '../types'

type UseEventFormOptions = { event?: Event; currentUserId: number; games: { id: number; category: string }[] }

export function useEventForm({ event, currentUserId, games }: UseEventFormOptions) {
  const saving = useRef(false)
  const navigate = useNavigate()
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const [imagePending, setImagePending] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const schema = eventFormSchema.superRefine((values, context) => {
    if (imageError) context.addIssue({ code: 'custom', path: ['imageUrl'], message: imageError })
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
  const pending = imagePending || create.isPending || update.isPending || form.formState.isSubmitting

  function reportImageError(message: string | null) {
    setImageError(message)
    if (message) form.setError('imageUrl', { message })
    else form.clearErrors('imageUrl')
  }

  const submit = form.handleSubmit(async (values) => {
    if (saving.current || imagePending) return
    saving.current = true
    form.clearErrors('root')
    const game = games.find((item) => item.id === values.gameId)
    const input: NewEvent = {
      ...values,
      imageUrl: values.imageUrl ?? eventCover(game?.category),
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
  return { form, submit, pending, imagePending, setImagePending, reportImageError }
}
