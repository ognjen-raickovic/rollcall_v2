# RollCall: design

## Product and users

Help tabletop players find a table and organizers fill events. Serve new and experienced
players on phones and desktops. Tone: welcoming, clear, understated. Brand: **RollCall**.

## Visual direction

Use Meetup's event discovery hierarchy as inspiration: useful filters, scannable dates,
locations, game labels, and available seats. Use charcoal/navy surfaces and restrained purple
accents for a slightly gaming-inspired identity, without copying Meetup's brand.
No reference screenshots are checked in yet; optional references belong in `docs/ref/`
relative to this file.

The discovery homepage now uses a two-column hero, search panel, four category tiles,
three upcoming event cards, and a simple how-it-works section. Use typography and a
code-native tabletop illustration with lucide icons; external photography is not required.
The login page pairs a short introduction with clearly selectable demo-player profiles.
Creation/editing share a focused form with grouped sections for basics, location/schedule,
players, and tags/visibility. Use existing input/textarea/button primitives and labeled native
selects/date-time pickers. Keep hosting tips secondary in a desktop sidebar and below the form
on phones. Inline errors use destructive text, a summary explains failed validation/saves,
and pending controls prevent duplicate submissions. Confirmation appears on the detail page.

Event discovery uses a labeled search/filter panel followed by a soonest-first card grid.
Controls cover event title, city, game, and open seats, with a persistent reset link. Cards
show local tabletop illustrations, a date badge, game/time, city/venue, price, and seat counts.
Full tables have an explicit Full label. The four original SVG illustrations in `public/images/`
share the approved palette; no remote photography is required.

Event details use a full-width image, a readable information column, and an attendance/host
sidebar that appears before the long information column on phones, keeping the join action
close to the event heading. Keep the cover compact rather than letting it dominate the page.
Show the exact address, schedule,
age guidance, visibility, tags, and host/game names. Use live status feedback after joining or
leaving and actionable error panels. Avoid exposing raw entity IDs in the interface.

## Token contract

Colors, fonts, and radii live in `src/index.css`; components use semantic Tailwind classes.
Dark is the default. There is no theme switch or separate light palette yet.

| Token | Value | Purpose |
| --- | --- | --- |
| background | `#10141f` | Charcoal/navy canvas |
| foreground | `#f1f3f9` | Main text |
| card / popover | `#191f2e` | Raised surfaces |
| card-foreground / popover-foreground | `#f1f3f9` | Raised-surface text |
| primary | `#b6a0ff` | Actions, links, brand |
| primary-foreground | `#171126` | Text on purple actions |
| secondary / muted | `#252c3d` | Secondary controls and quiet surfaces |
| secondary-foreground | `#f1f3f9` | Secondary-control text |
| muted-foreground | `#aab4c9` | Supporting text |
| accent | `#34294d` | Purple hover surface |
| accent-foreground | `#e6ddff` | Text on accent |
| destructive | `#ff9b9b` | Error text and destructive actions |
| destructive-foreground | `#301018` | Future destructive-control text |
| border / input | `#59657d` | Borders and field boundaries |
| ring | `#b6a0ff` | Keyboard focus |
| font-heading / font-body | system sans-serif | Clean type without remote font requests |
| radius | `0.75rem` | Base radius; sm/md/lg/xl derive from it |

## Layout and interaction

- Mobile first: one column on phones; category tiles expand to two/four columns and event
  cards to two/three columns. The hero becomes two columns on large screens. Mobile navigation
  keeps the brand and account on the first row and page links on a second row.
- Main content `max-w-6xl`, comfortable padding, wrapping navigation, and readable line lengths.
- Starter spacing scale: 1, 2, 3, 4, 6, 8, 12, 16. Larger gaps between sections.
- One primary heading per page; body text 14–16 px, lines around 70 characters.
- Icons: `lucide-react` only, never emoji. Future images should show actual games/tables,
  have consistent aspect ratios and useful alt text. No generated assets needed now.
- Favor borders/spacing over shadows. Use existing shadcn components before adding primitives.
- Semantic links/buttons, labeled inputs, visible focus, skip link, and text contrast at least 4.5:1.
- Data views include loading, empty, error, and not-found states. Inspect at 375 px and 1440 px.

## Don't

- Keep the discovery hero focused on finding events; no unnecessary gradients, neon glow,
  ornamental animation, or invented activity counts. Hover/focus and pending indicators have a purpose.
- No heavy gaming fonts, emoji icons, or everything inside shadowed cards.
- No raw color/font/radius values in components; add and document tokens first.
- No recurring events, invitations, uploads, or advanced administrative UI in event management.
