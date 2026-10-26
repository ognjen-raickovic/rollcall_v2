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
Authentication pages use focused labeled email/password fields, password confirmation for
registration/reset, inline errors and visible pending/status feedback. Use appropriate
autocomplete values and keep long email addresses/messages inside the 375px viewport.
Login links to registration and recovery; confirmation has clear next steps and resend.
The explicitly enabled development-only demo page retains selectable mock-player profiles,
with a visible demo label. Real login never grants numeric demo privileges.

Real profiles use a readable identity/biography/location summary and separate My Games list.
Own profiles offer clear Edit profile and public-view links; a new account gets friendly
completion guidance. Editing groups public details/location separately from private optional
birth year, with explicit self-declared wording. Games use labeled native selectors and
per-row update/remove actions with pending, success and error feedback. Reuse country/city
controls through route composition. Use initials rather than adding picture uploads. Public
views contain no email, age or roles. Preserve semantic tokens, keyboard focus and readable
wrapping at 375px and 1440px in both themes.

Milestone 4C-1 keeps this layout while connecting event reads. Public cards use only real
summary fields and omit price because summaries do not contain it. Discovery shows loaded
matches and a clear Load More action, with retry/empty guidance; it never invents counts or
substitutes fixture cards. Details show confirmed viewer state and authorized addresses only.
Real join/leave/edit controls use confirmed permissions and pending feedback. Numeric
development demos have separate routes and labels. Seat progress uses primary/secondary
tokens in both themes, including native progress fill. No new palette or redesign is introduced.

Creation/editing share a focused form with grouped sections for basics, location/schedule,
players, and tags/visibility. Use existing input/textarea/button primitives and labeled native
selects/date-time pickers. Keep hosting tips secondary in a desktop sidebar and below the form
on phones. Inline errors use destructive text, a summary explains failed validation/saves,
and pending controls prevent duplicate submissions. Confirmation appears on the detail page.
The first form card and first sidebar card align at the top; keep the desktop sidebar sticky.
Required markers and field help replace the former introductory required/timezone paragraph.
The optional cover control shows a 16:9 object-cover preview, labeled native file input, clear
processing/error feedback, and a reset-to-default action. Cropping preserves source proportions.
Tags use a Radix popover with labeled native checkboxes, a Done action, and removable chips.
Tab/Space operate checkboxes; Escape closes the popover and returns focus to its trigger.
Keep the popup within the viewport and disable choices beyond six or incompatible with experience.

Event discovery uses a labeled search/filter panel followed by a soonest-first card grid.
Controls cover event title, country, dependent city, game, and open seats, with a persistent reset link. Cards
show local tabletop illustrations, a date badge, game/time, city/venue, price, and seat counts.
Full tables have an explicit Full label. The four original SVG illustrations in `public/images/`
share the approved palette; no remote photography is required.

Event details use a full-width image, a readable information column, and an attendance/host
sidebar that appears before the long information column on phones, keeping the join action
close to the event heading. Keep the cover compact rather than letting it dominate the page.
Show the exact address only to the host/current participants, alongside schedule,
age guidance, visibility, tags, and host/game names. Other viewers see an explanation that
the precise address is shared with confirmed participants. Use live status feedback after joining or
leaving and actionable error panels. Avoid exposing raw entity IDs in the interface.

## Location controls

Preserve the existing form/discovery hierarchy and palettes. Use a labeled native country
select loaded from the geography API, followed by a dependent searchable city input. The
city field is disabled until a country is selected. Country/city loading, empty results,
network errors and retry actions must be visible without blocking unrelated event browsing.

The city input follows the editable ARIA combobox pattern: focus opens suggestions,
ArrowUp/ArrowDown moves the active option, Enter confirms it, Escape closes the list and
focus stays on the input. Keep the active option and selected city visually distinct.
Typing clears selection; typing a familiar label alone does not validate a form. Country
changes immediately clear the city and old suggestions. Search is debounced about 250 ms.
Show approximately four results with a secondary administrative-region line so same-name
places can be distinguished. Do not show raw IDs. Dropdown content must fit the field and
viewport at 375px, wrap long names, and remain readable in both themes.
Open the list above the input when there is more room there, and keep the keyboard-active
option in view. Align country/city and search inputs at their labels; helper text must not
shift neighboring controls down.

Create/edit share these controls through route composition. A legacy fixture's unresolved
city label is guidance until a real suggestion is confirmed. Venue/meeting point has no
required marker and may be empty; omit absent venue text and stray separators in cards
and details. Address remains required in forms. Show discreet GeoNames attribution near
location selection; do not redesign the hero or advertise nonexistent foreign mock events.

## Token contract

Colors, fonts, and radii live in `src/index.css`; components use semantic Tailwind classes.
Dark is the default. The navbar Sun/Moon button names the action (switch to light/dark).
`rollcall.theme` in localStorage restores the choice; a head script applies it before React
starts. Without storage, switching works for the current page runtime. Both palettes use
the same layout, typography, radius, and illustrations; the bundled cover artwork keeps
its original gaming palette in both themes. Never invert uploaded photographs.

| Token                                | Dark              | Light             | Purpose                               |
| ------------------------------------ | ----------------- | ----------------- | ------------------------------------- |
| background                           | `#10141f`         | `#f5f6fa`         | Canvas                                |
| foreground                           | `#f1f3f9`         | `#1b2233`         | Main text                             |
| card / popover                       | `#191f2e`         | `#ffffff`         | Raised surfaces                       |
| card-foreground / popover-foreground | `#f1f3f9`         | `#1b2233`         | Raised-surface text                   |
| primary                              | `#b6a0ff`         | `#6545b5`         | Actions, links, brand                 |
| primary-foreground                   | `#171126`         | `#ffffff`         | Text on purple actions                |
| secondary / muted                    | `#252c3d`         | `#e9ecf4`         | Secondary controls and quiet surfaces |
| secondary-foreground                 | `#f1f3f9`         | `#252c3d`         | Secondary-control text                |
| muted-foreground                     | `#aab4c9`         | `#536079`         | Supporting text                       |
| accent                               | `#34294d`         | `#eee8fc`         | Purple hover surface                  |
| accent-foreground                    | `#e6ddff`         | `#493077`         | Text on accent                        |
| destructive                          | `#ff9b9b`         | `#b42335`         | Error text and destructive actions    |
| destructive-foreground               | `#301018`         | `#ffffff`         | Text on destructive controls          |
| border / input                       | `#59657d`         | `#7b879d`         | Borders and field boundaries          |
| ring                                 | `#b6a0ff`         | `#6545b5`         | Keyboard focus                        |
| font-heading / font-body             | system sans-serif | system sans-serif | No remote font requests               |
| radius                               | `0.75rem`         | `0.75rem`         | sm/md/lg/xl derive from it            |

## Layout and interaction

- Mobile first: one column on phones; category tiles expand to two/four columns and event
  cards to two/three columns. The hero becomes two columns on large screens. Mobile navigation
  keeps the brand, theme toggle, and account on the first row and page links on a second row.
  On phones the decorative account avatar is hidden and the visible name is truncated with a title.
- Main content `max-w-6xl`, comfortable padding, wrapping navigation, and readable line lengths.
- User-entered text wraps even inside long words or URLs, preserving narrow layouts.
- New route navigation starts at the top; browser Back/Forward restores the saved scroll position.
- Starter spacing scale: 1, 2, 3, 4, 6, 8, 12, 16. Larger gaps between sections.
- One primary heading per page; body text 14–16 px, lines around 70 characters.
- Icons: `lucide-react` only, never emoji. Future images should show actual games/tables,
  have consistent aspect ratios and useful alt text. No generated assets needed now.
- Favor borders/spacing over shadows. Use existing shadcn components before adding primitives.
- Semantic links/buttons, labeled inputs, visible focus, skip link, and text contrast at least 4.5:1.
- Data views include loading, empty, error, and not-found states. Inspect at 375 px and 1440 px.
- Real event forms share the existing two-column form/sidebar layout and use the existing
  cover picker with a preview/default illustration. Keep drafts on failed
  saves, label the private address clearly and place validation feedback beside its field.
- Host deletion uses a modal confirmation with a descriptive heading, participation-removal
  explanation, initially focused Cancel and keyboard dismissal. Pending writes disable repeated
  actions; success/error feedback uses status/alert semantics in both themes.
- If event details save but the image fails, clearly explain the partial result and offer
  Retry cover/View saved event. Image preparation/upload has a useful pending state. Preserve
  cover aspect ratios and a local fallback on failed loads; no redesign or new palette is needed.

## Don't

- Keep the discovery hero focused on finding events; no unnecessary gradients, neon glow,
  ornamental animation, or invented activity counts. Hover/focus and pending indicators have a purpose.
- No heavy gaming fonts, emoji icons, or everything inside shadowed cards.
- No raw color/font/radius values in components; add and document tokens first.
- Private-code controls/modal use existing tokens and native dialogs in 5A. Hide codes until deliberate reveal and explain exact-address access.
- No recurring events or advanced administrative UI in event management.

## Milestone 5B-1

Administrative pages retain the current tokens and restrained cards: one heading, effective role, compact section navigation and bounded account/audit lists that wrap on phones. Exact UUID lookup is labeled; public emails/private data are absent. Native role-change confirmation focuses Cancel, supports Escape and returns focus. Provide loading, empty, restricted, error/retry and successful-save feedback. No decorative dashboard metrics, fake moderation controls or navbar redesign.
