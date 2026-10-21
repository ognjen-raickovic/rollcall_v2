import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { ListingsList } from '@/features/listings/components/listings-list'

export function Listings() {
  const [search, setSearch] = useState('')

  return (
    <section>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="text-3xl font-bold">Listings</h1>
        <Input
          aria-label="Search listings"
          placeholder="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-xs"
        />
      </div>

      <ListingsList search={search} />
    </section>
  )
}
