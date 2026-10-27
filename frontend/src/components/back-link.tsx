import type { ComponentProps } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

type BackLinkProps = ComponentProps<typeof Link>

export function BackLink({ children, className, ...props }: BackLinkProps) {
  return (
    <Button asChild className={className}>
      <Link {...props}>
        <ArrowLeft aria-hidden="true" />
        {children}
      </Link>
    </Button>
  )
}
