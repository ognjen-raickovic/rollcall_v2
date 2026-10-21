import { DiscoveryHero } from '@/features/events/components/discovery-hero'
import { FeaturedEvents } from '@/features/events/components/featured-events'
import { HowItWorks } from '@/features/events/components/how-it-works'
import { useGames } from '@/features/games/api/use-games'
import { GameCategories } from '@/features/games/components/game-categories'

export function Home() {
  const games = useGames()
  return (
    <>
      <DiscoveryHero />
      <GameCategories />
      <FeaturedEvents games={games.data} />
      <HowItWorks />
    </>
  )
}
