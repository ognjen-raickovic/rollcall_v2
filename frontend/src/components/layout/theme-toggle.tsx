import { useEffect, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { applyTheme, getTheme, setTheme, subscribeTheme } from '@/lib/theme'

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark' as const)
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}
