import { useState } from 'react'

import { GameSymbol } from '@/components/game-symbol'
import { cn } from '@/lib/utils'

type EventImageProps = {
  src: string | null
  title: string
  category?: string
  className?: string
  priority?: boolean
}

export function EventImage({ src, title, category, className, priority = false }: EventImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-secondary', className)}>
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt={`Tabletop illustration for ${title}`}
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          role="img"
          aria-label={`Tabletop gaming illustration for ${title}`}
          className="flex h-full w-full items-center justify-center bg-accent"
        >
          <GameSymbol category={category} className="size-20 text-primary" />
        </div>
      )}
    </div>
  )
}
