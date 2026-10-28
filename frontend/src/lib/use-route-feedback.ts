import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

// Acknowledged route feedback is consumed once, so refresh/Back cannot replay success.
export function useRouteFeedback(key: string, identity?: string | null) {
  const location = useLocation(),
    navigate = useNavigate()
  const consumed = useRef(false)
  const [value, setValue] = useState<unknown>(() =>
    location.state && typeof location.state === 'object' ? location.state[key] : null,
  )
  const currentScope = `${identity ?? ''}:${location.pathname}${location.search}${location.hash}`
  const scope = useRef(currentScope)
  useEffect(() => {
    if (scope.current !== currentScope) {
      scope.current = currentScope
      setValue(null)
    }
  }, [currentScope])
  useEffect(() => {
    if (consumed.current || value == null) return
    consumed.current = true
    const next = { ...location.state }
    delete next[key]
    if (key === 'profileSaved') delete next.gamesSaved
    void navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: next,
    })
  }, [key, location.hash, location.pathname, location.search, location.state, navigate, value])
  return scope.current === currentScope ? value : null
}
