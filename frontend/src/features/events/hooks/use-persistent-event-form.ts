import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { HttpError } from '@/lib/http-client'
import { notify, notifyFailure } from '@/lib/notifications'
import { persistentEventFormDefaults, persistentEventFormSchema } from '../api/persistent-event-form-values'
import type { EventFormValues } from '../api/event-form-values'
import type { CreateEventInput, HostEventDetails } from '../api/event-write-dtos'
import type { EventActionSession } from '../api/persistent-event-actions-api'
import { usePersistentCreateEvent, usePersistentUpdateEvent } from '../api/use-persistent-event-actions'
import { usePersistentCoverMutation } from '../api/use-persistent-event-covers'
import { preparedCoverFile } from '../api/persistent-event-covers-api'

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
  const [coverDraft, setCoverDraft] = useState<string | null | undefined>(undefined)
  const [imagePending, setImagePending] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState(false)
  const [savedEvent, setSavedEvent] = useState<HostEventDetails | undefined>(event)
  const [partialSavedId, setPartialSavedId] = useState<string | null>(null)
  const persisted = useRef<HostEventDetails | undefined>(event)
  const lastSavedInput = useRef<string | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const create = usePersistentCreateEvent(session)
  const update = usePersistentUpdateEvent(session)
  const cover = usePersistentCoverMutation(session)
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
  const pending =
    create.isPending || update.isPending || cover.isPending || form.formState.isSubmitting || imagePending
  async function saveCover(id: string) {
    if (coverDraft === undefined) return
    const result =
      coverDraft === null
        ? await cover.mutateAsync({ id })
        : await cover.mutateAsync({ id, file: preparedCoverFile(coverDraft) })
    if (mounted.current) {
      setImageError(null)
      setCoverDraft(undefined)
      setSavedEvent((previous) => (previous ? { ...previous, cover: result.cover } : previous))
    }
  }
  async function finish(id: string) {
    await session.getAccessToken()
    if (!mounted.current) return
    await navigate(`/events/${id}`, {
      replace: true,
    })
    notify(event ? 'event.updated' : 'event.created')
  }
  function coverFailed(error: unknown, id: string) {
    if (!mounted.current) return
    notify('cover.partial', 'warning')
    const message =
      error instanceof HttpError && error.fields.image?.length
        ? error.fields.image.join(' ')
        : error instanceof Error
          ? error.message
          : 'The image could not be saved. Please try again.'
    setImageError(message)
    setPartialSavedId(id)
    setRequiresLogin(error instanceof HttpError && error.status === 401)
    form.setError('root.server', {
      message:
        'Your event was saved, but its cover was not confirmed saved. Retry the cover or view your saved event.',
    })
  }
  async function retryCover() {
    if (saving.current || imagePending || selectionError || !persisted.current) return
    saving.current = true
    try {
      await saveCover(persisted.current.id)
      await finish(persisted.current.id)
    } catch (error) {
      coverFailed(error, persisted.current.id)
    } finally {
      saving.current = false
    }
  }
  const submit = form.handleSubmit(async (input) => {
    if (saving.current || imagePending || selectionError) return
    saving.current = true
    setRequiresLogin(false)
    form.clearErrors('root')
    try {
      const serialized = JSON.stringify(input)
      const previous = persisted.current
      const saved =
        previous && lastSavedInput.current === serialized
          ? previous
          : previous
            ? await update.mutateAsync({ id: previous.id, input })
            : await create.mutateAsync(input)
      persisted.current = saved
      lastSavedInput.current = serialized
      if (!mounted.current) return
      setSavedEvent(saved)
      try {
        await saveCover(saved.id)
      } catch (error) {
        coverFailed(error, saved.id)
        return
      }
      await finish(saved.id)
    } catch (error) {
      if (!mounted.current) return
      notifyFailure(error)
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
  return {
    form,
    submit,
    pending,
    requiresLogin,
    coverDraft,
    setCoverDraft,
    imagePending,
    setImagePending,
    imageError,
    setImageError: (message: string | null) => {
      setImageError(message)
      setSelectionError(Boolean(message))
    },
    savedEvent,
    partialSavedId,
    retryCover,
    coverPending: cover.isPending,
  }
}
