import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FormSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className={cn(
          'h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-2 pr-10 pl-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
          className,
        )}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
