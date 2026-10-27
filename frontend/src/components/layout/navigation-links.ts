export const navigationLinks = [
  { to: '/events', label: 'Explore events' },
  { to: '/events/new', label: 'Host an event' },
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact' },
] as const

export const demoNavigationLink = { to: '/demo/events', label: 'Demo events' } as const

export const desktopNavigationMedia = '(min-width: 80rem)'
