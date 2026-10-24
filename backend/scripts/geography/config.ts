// GeoNames CC BY 4.0. These are import scope, not frontend country enums.
export const COUNTRY_CODES = ['ME', 'RS', 'BA', 'HR'] as const
export type CountryCode = (typeof COUNTRY_CODES)[number]

// Individual current populated places, including small localities/farm villages.
// Exclude historical/abandoned/destroyed places, groups and city sections.
export const POPULATED_PLACE_CODES = new Set([
  'PPL',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLA5',
  'PPLC',
  'PPLCD',
  'PPLF',
  'PPLG',
  'PPLL',
  'PPLR',
])

export const DEVELOPMENT_SEEDS: Record<CountryCode, readonly string[]> = {
  ME: ['Podgorica', 'Nikšić', 'Budva', 'Bar'],
  RS: ['Beograd', 'Novi Sad', 'Čačak'],
  BA: ['Sarajevo', 'Banja Luka', 'Mostar'],
  HR: ['Zagreb', 'Split', 'Rijeka'],
}

export const SOURCE_BASE_URL = 'https://download.geonames.org/export/dump/'
export const MAX_ZIP_BYTES = 50 * 1024 * 1024
export const MAX_TEXT_BYTES = 200 * 1024 * 1024
