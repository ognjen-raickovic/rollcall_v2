import { Skeleton } from '@/components/ui/skeleton'

import { useListings } from '../api/use-listings'
import { ListingCard } from './listing-card'

type ListingsListProps = {
  search: string
}

// Listings with all three states: loading, empty and error.
export function ListingsList({ search }: ListingsListProps) {
  const { data: listings, isLoading, error } = useListings(search)

  if (isLoading) {
    return (
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="mt-8 text-destructive">Listings failed to load. Please try again.</p>
  }

  if (!listings || listings.length === 0) {
    return <p className="mt-8 text-muted-foreground">No listings match "{search}".</p>
  }

  return (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <li key={listing.id}>
          <ListingCard listing={listing} />
        </li>
      ))}
    </ul>
  )
}
