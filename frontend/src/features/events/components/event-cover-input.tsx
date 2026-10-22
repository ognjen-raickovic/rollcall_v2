import { useEffect, useRef } from 'react'
import type { Ref } from 'react'
import { ImagePlus, LoaderCircle, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { EVENT_IMAGE_TYPES, prepareEventCover } from '../api/event-covers'
import { EventImage } from './event-image'

type EventCoverInputProps = {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
  inputRef: Ref<HTMLInputElement>
  value: string | null
  fallback: string
  pending: boolean
  processing: boolean
  onChange: (value: string | null) => void
  onPendingChange: (pending: boolean) => void
  onError: (message: string | null) => void
}

export function EventCoverInput({
  inputRef,
  value,
  fallback,
  pending,
  processing,
  onChange,
  onPendingChange,
  onError,
  ...attributes
}: EventCoverInputProps) {
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  async function select(file: File | undefined) {
    if (!file) return
    const request = ++generation.current
    onPendingChange(true)
    try {
      const result = await prepareEventCover(file)
      if (generation.current !== request) return
      onError(null)
      onChange(result)
    } catch (error) {
      if (generation.current === request)
        onError(error instanceof Error ? error.message : 'This image could not be opened. Try another image.')
    } finally {
      if (generation.current === request) onPendingChange(false)
    }
  }

  return (
    <div className="space-y-4">
      <EventImage
        src={value ?? fallback}
        title="your event preview"
        priority
        className="aspect-video w-full rounded-lg border"
      />
      <Input
        {...attributes}
        ref={inputRef}
        type="file"
        accept={[...EVENT_IMAGE_TYPES, '.jpg', '.jpeg', '.png', '.webp'].join(',')}
        disabled={pending}
        className="h-auto min-h-11 bg-background py-2 file:mr-3 file:font-semibold file:text-primary"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void select(file)
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {processing ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          {processing
            ? 'Preparing your image...'
            : value
              ? 'Custom cover selected. Choose another file to replace it.'
              : 'Using the default cover for your game.'}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            onError(null)
            onChange(null)
          }}
        >
          <RotateCcw aria-hidden="true" /> {value ? 'Remove custom cover' : 'Use default cover'}
        </Button>
      </div>
    </div>
  )
}
