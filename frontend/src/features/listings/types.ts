// Example entity. Replace it with your app's own entities (see docs/entities.md).
export type Listing = {
  id: number
  title: string
  description: string
  price: number
  category: 'games' | 'consoles' | 'accessories'
  city: string
  imageUrl: string
  createdAt: string
}

export type NewListing = Omit<Listing, 'id' | 'createdAt'>
