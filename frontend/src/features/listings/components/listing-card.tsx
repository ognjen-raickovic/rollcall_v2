import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { Listing } from '../types'

type ListingCardProps = {
  listing: Listing
}

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <Card className="overflow-hidden pt-0">
      <img src={listing.imageUrl} alt={listing.title} className="aspect-[3/2] w-full bg-muted object-cover" />
      <CardHeader>
        <Badge variant="secondary">{listing.category}</Badge>
        <CardTitle className="text-lg">{listing.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm">
        <span className="text-lg font-semibold">€{listing.price}</span>
        <span className="text-muted-foreground">{listing.city}</span>
      </CardContent>
    </Card>
  )
}
