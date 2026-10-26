import type { Client } from 'pg'
export const stagingGames = [
  {
    id: 1,
    name: 'Dungeons & Dragons',
    category: 'role-playing',
    description: 'Collaborative fantasy adventures guided by a Dungeon Master.',
    min_players: 2,
    max_players: 7,
  },
  {
    id: 2,
    name: 'Magic: The Gathering',
    category: 'trading-card',
    description: 'Build decks and explore casual or competitive formats.',
    min_players: 2,
    max_players: 6,
  },
  {
    id: 3,
    name: 'Yu-Gi-Oh!',
    category: 'trading-card',
    description: 'Summon monsters and duel with your own deck.',
    min_players: 2,
    max_players: 2,
  },
  {
    id: 4,
    name: 'Catan',
    category: 'board-game',
    description: 'Trade resources and build settlements together.',
    min_players: 3,
    max_players: 4,
  },
  {
    id: 5,
    name: 'Blood on the Clocktower',
    category: 'social-deduction',
    description: 'A storyteller guides a village through mystery and deduction.',
    min_players: 5,
    max_players: 20,
  },
  {
    id: 6,
    name: 'Ticket to Ride',
    category: 'board-game',
    description: 'Connect cities by collecting and playing train cards.',
    min_players: 2,
    max_players: 5,
  },
  {
    id: 7,
    name: 'Pathfinder',
    category: 'role-playing',
    description: 'Fantasy role-playing with tactical choices and shared stories.',
    min_players: 2,
    max_players: 7,
  },
  {
    id: 8,
    name: 'Pandemic',
    category: 'board-game',
    description: 'Work as a team to contain outbreaks around the world.',
    min_players: 2,
    max_players: 4,
  },
]
export async function initializeStagingCatalog(client: Client) {
  await client.query('begin')
  try {
    await client.query(
      "set local lock_timeout='10s'; set local statement_timeout='30s'; lock table public.games,public.countries in share row exclusive mode",
    )
    const countries = await client.query(
      'select iso_code from public.countries where iso_code=any($1::text[]) and enabled',
      [['ME', 'RS', 'BA', 'HR']],
    )
    if (countries.rowCount !== 4)
      throw new Error(
        'Essential enabled countries must already be installed by migrations; no existing country is overwritten.',
      )
    const current = await client.query<{ id: number; name: string }>('select id,name from public.games')
    if (
      stagingGames.some((game) =>
        current.rows.some(
          (row) =>
            (row.id === game.id || row.name === game.name) && (row.id !== game.id || row.name !== game.name),
        ),
      )
    )
      throw new Error(
        'Catalog identity conflict: review existing games; automatic remapping/overwrite is refused.',
      )
    const inserted = await client.query(
      `insert into public.games(id,name,category,description,min_players,max_players) overriding system value
   select id,name,category,description,min_players,max_players from jsonb_to_recordset($1::jsonb)
   as item(id integer,name text,category text,description text,min_players integer,max_players integer)
   on conflict(id) do nothing`,
      [JSON.stringify(stagingGames)],
    )
    // Never move the sequence backwards, including if custom catalog records exist.
    await client.query(
      "select setval(pg_get_serial_sequence('public.games','id'),greatest((select last_value from public.games_id_seq),(select max(id) from public.games)),true)",
    )
    await client.query('commit')
    return { inserted: inserted.rowCount ?? 0, expectedEssentialGames: 8 }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
