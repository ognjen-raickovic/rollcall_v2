import type { ComponentProps } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

type BackLinkProps = ComponentProps<typeof Link>

export function BackLink({ children, className, ...props }: BackLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        'inline-flex min-h-10 w-fit max-w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </Link>
  )
}
