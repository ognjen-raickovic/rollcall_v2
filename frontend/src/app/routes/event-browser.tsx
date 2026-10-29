import { Suspense, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Events } from './events'

// Only an in-app discovery visit enables a background preview. Persisted history
// state on a refresh/direct link cannot turn a dedicated page into a modal.
export function EventBrowser() {
  const location = useLocation()
  const visitedDiscovery = useRef(location.pathname === '/events')
  if (location.pathname === '/events') visitedDiscovery.current = true
  const state = location.state?.eventPreview
  const preview =
    visitedDiscovery.current &&
    /^\/events\/[0-9a-f-]{36}$/i.test(location.pathname) &&
    typeof state?.from === 'string' &&
    state.from === `/events${location.search}`
  return (
    <>
      {(location.pathname === '/events' || preview) && <Events />}
      <Suspense fallback={<p role="status">Loading event...</p>}>
        <Outlet
          context={{
            preview,
            focusId: preview ? state.focusId : null,
            scrollY: preview && Number.isFinite(state.scrollY) ? state.scrollY : 0,
          }}
        />
      </Suspense>
    </>
  )
}
