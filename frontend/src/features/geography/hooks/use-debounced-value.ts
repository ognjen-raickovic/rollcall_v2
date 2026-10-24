import { useEffect, useState } from 'react'

export function useDebouncedValue(value: string, milliseconds = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), milliseconds)
    return () => clearTimeout(timer)
  }, [value, milliseconds])
  return debounced
}
