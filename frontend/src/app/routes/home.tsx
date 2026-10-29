import { DiscoveryHero } from '@/features/events/components/discovery-hero'
import { FeaturedEvents } from '@/features/events/components/featured-events'
import { HowItWorks } from '@/features/events/components/how-it-works'
import { GameCategories } from '@/features/games/components/game-categories'
import { LocationFilterFields } from '@/features/geography/components/location-filter-fields'
import { useApiSession } from '@/features/users/api/use-auth'

export function Home() {
  const session = useApiSession()
  return (
    <>
      <DiscoveryHero locationFilters={<LocationFilterFields idPrefix="home-location" />} />
      <GameCategories />
      <FeaturedEvents session={session} />
      <HowItWorks />
    </>
  )
}
