-- DEVELOPMENT ONLY: a deliberately small hand-curated selection of real places.
-- Not a complete gazetteer and not an imported GeoNames dataset. Coordinates,
-- population, divisions and source identifiers are omitted rather than fabricated.
-- The production country catalog is installed by the geography migration.
insert into public.cities(country_id, name)
select country.id, place.name
from (values
  ('ME', 'Podgorica'), ('ME', 'Nikšić'), ('ME', 'Budva'), ('ME', 'Bar'),
  ('RS', 'Beograd'), ('RS', 'Novi Sad'), ('RS', 'Čačak'),
  ('BA', 'Sarajevo'), ('BA', 'Banja Luka'), ('BA', 'Mostar'),
  ('HR', 'Zagreb'), ('HR', 'Split'), ('HR', 'Rijeka')
) as place(iso_code, name)
join public.countries country on country.iso_code = place.iso_code;

-- Read-only catalog aligned with the frontend's current fixture IDs only for
-- convenient local development. No mock user is converted to a real Auth account.
insert into public.games(name, category, description, min_players, max_players) values
  ('Dungeons & Dragons', 'role-playing', 'Collaborative fantasy adventures guided by a Dungeon Master.', 2, 7),
  ('Magic: The Gathering', 'trading-card', 'Build decks and explore casual or competitive formats.', 2, 6),
  ('Yu-Gi-Oh!', 'trading-card', 'Summon monsters and duel with your own deck.', 2, 2),
  ('Catan', 'board-game', 'Trade resources and build settlements together.', 3, 4),
  ('Blood on the Clocktower', 'social-deduction', 'A storyteller guides a village through mystery and deduction.', 5, 20),
  ('Ticket to Ride', 'board-game', 'Connect cities by collecting and playing train cards.', 2, 5),
  ('Pathfinder', 'role-playing', 'Fantasy role-playing with tactical choices and shared stories.', 2, 7),
  ('Pandemic', 'board-game', 'Work as a team to contain outbreaks around the world.', 2, 4);
