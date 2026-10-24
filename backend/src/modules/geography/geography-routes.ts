import type { FastifyInstance } from 'fastify'
import { parseInput } from '../../shared/api-error.js'
import { citySearchSchema, countriesQuerySchema } from './geography-schema.js'
import type { GeographyRepository } from './types.js'

export function registerGeographyRoutes(
  app: FastifyInstance,
  repository: GeographyRepository,
  limits: { defaultLimit: number; maximumLimit: number },
): void {
  const searchSchema = citySearchSchema(limits.defaultLimit, limits.maximumLimit)
  app.get('/api/countries', async (request) => {
    parseInput(countriesQuerySchema, request.query)
    return repository.listCountries()
  })
  app.get('/api/cities', async (request) => {
    const input = parseInput(searchSchema, request.query)
    return repository.searchCities(input)
  })
}
