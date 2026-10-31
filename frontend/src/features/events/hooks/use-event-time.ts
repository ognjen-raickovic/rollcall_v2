import { useEffect, useState } from 'react'

// Wake exactly at a card boundary, with a bounded timeout for distant events.
export function useEventTime(startsAt: string, endsAt: string) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const current = Date.now()
    const next = [Date.parse(startsAt), Date.parse(endsAt)].find((value) => value > current)
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      next ? Math.min(60_000, next - current + 1) : 60_000,
    )
    return () => window.clearTimeout(timer)
  }, [now, startsAt, endsAt])
  return now
}
