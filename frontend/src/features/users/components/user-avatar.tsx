import { cva } from 'class-variance-authority'

const avatarStyles = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg bg-accent font-semibold text-accent-foreground',
  {
    variants: { size: { sm: 'size-8 text-xs', md: 'size-10 text-sm' } },
    defaultVariants: { size: 'md' },
  },
)

type UserAvatarProps = { name: string; size?: 'sm' | 'md' }

export function UserAvatar({ name, size }: UserAvatarProps) {
  return (
    <span aria-hidden="true" className={avatarStyles({ size })}>
      {name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')}
    </span>
  )
}
