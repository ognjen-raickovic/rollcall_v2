import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { notify, notifyFailure } from '@/lib/notifications'
import { submitEventReport, type EventReportInput } from './event-reports-api'
import type { EventActionSession } from './event-write-dtos'
export function useReportEvent(id: string, session: EventActionSession) {
  const current = useRef(session),
    controller = useRef<AbortController | null>(null)
  current.current = session
  useEffect(() => () => controller.current?.abort(), [session.viewerId, id])
  return useMutation({
    onSuccess: (result) => {
      if (current.current.viewerId === session.viewerId && !controller.current?.signal.aborted)
        notify(result.created ? 'report.sent' : 'report.existing', result.created ? 'success' : 'info')
    },
    onError: (error) => {
      if (current.current.viewerId === session.viewerId && !controller.current?.signal.aborted)
        notifyFailure(error)
    },
    gcTime: 0,
    mutationFn: async (input: EventReportInput) => {
      controller.current?.abort()
      const active = new AbortController()
      controller.current = active
      const actor = session.viewerId,
        result = await submitEventReport(id, input, session, active.signal)
      if (active.signal.aborted || current.current.viewerId !== actor)
        throw new Error('Your account changed. Try again.')
      return result
    },
  })
}
