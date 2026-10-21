import { NotFoundError, delay } from '@/lib/mock-db'

import type { Listing, NewListing } from '../types'

let listings: Listing[] = [
  {
    id: 1,
    title: 'EA Sports FC 26 (PS5)',
    description: 'Used for two months, no scratches on the disc, original case.',
    price: 35,
    category: 'games',
    city: 'Podgorica',
    imageUrl: 'https://picsum.photos/seed/fc26/600/400',
    createdAt: '2026-10-12',
  },
  {
    id: 2,
    title: 'Nintendo Switch OLED',
    description: 'White edition, two Joy-Cons and a carrying case.',
    price: 240,
    category: 'consoles',
    city: 'Niksic',
    imageUrl: 'https://picsum.photos/seed/switch/600/400',
    createdAt: '2026-10-10',
  },
  {
    id: 3,
    title: 'DualSense controller',
    description: 'Works perfectly, no stick drift. Blue.',
    price: 45,
    category: 'accessories',
    city: 'Budva',
    imageUrl: 'https://picsum.photos/seed/dualsense/600/400',
    createdAt: '2026-10-08',
  },
]

export const listingsApi = {
  list: (search = '') => delay(listings.filter((l) => l.title.toLowerCase().includes(search.toLowerCase()))),

  get: (id: number) => {
    const listing = listings.find((l) => l.id === id)
    if (!listing) return Promise.reject(new NotFoundError('Listing', id))
    return delay(listing)
  },

  create: (input: NewListing) => {
    const listing: Listing = { ...input, id: Date.now(), createdAt: new Date().toISOString().slice(0, 10) }
    listings = [listing, ...listings]
    return delay(listing)
  },

  update: (id: number, changes: Partial<NewListing>) => {
    listings = listings.map((l) => (l.id === id ? { ...l, ...changes } : l))
    return listingsApi.get(id)
  },

  remove: (id: number) => {
    listings = listings.filter((l) => l.id !== id)
    return delay(undefined)
  },
}
