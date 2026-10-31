export function eventLifecycle(
  event: { status: 'scheduled' | 'cancelled'; startsAt: string; endsAt: string },
  now = Date.now(),
) {
  if (event.status === 'cancelled') return 'Cancelled'
  if (now >= Date.parse(event.endsAt)) return 'Finished'
  if (now >= Date.parse(event.startsAt)) return 'In progress'
  return 'Upcoming'
}
