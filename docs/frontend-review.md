# RollCall final frontend review

This baseline review is retained from before the cover/tag/theme polish. See
[the MVP polish review](mvp-polish.md) for the subsequent changes and latest verification.

Reviewed on 2026-10-22 on `chore/mvp-finalization` for AI-DEV 2026 Workshop 3.
This review covers the frontend MVP and its documented mock lifecycle. It does not
certify a backend, real authentication, persistence, or server-side security.

## Outcome

**PASS: the frontend MVP is ready to carry into Workshop 4.** No confirmed submission
blockers remain in the reviewed scope. The changes are available for review without
committing, pushing, merging, or changing branches.

## Changed files and confirmed fixes

| File | Change |
| --- | --- |
| `frontend/src/components/layout/app-layout.tsx` | Allow long user-entered words and URLs to wrap within main content, including cards and details. |
| `frontend/src/app/routes/root-layout.tsx` | Enable React Router scroll restoration: new locations open at the top, Back restores the previous position. |
| `frontend/DESIGN.md` | Document wrapping and navigation behavior without changing visual tokens. |
| `frontend/CLAUDE.md` | Correct the blanket public-read rule to account for authorized private-event reads. |
| `SPEC.md` | Distinguish the implemented create/edit UI from API-only event removal. |
| `docs/entities.md` | Clarify immutable audit timestamps and the implemented category composition. |
| `README.md` | Add submission validation guidance, the review link, and accurate MVP limitations. |
| `docs/frontend-review.md` | Record requirements, executed checks, reproducible regression steps, and remaining limits. |

The overflow bug was reproduced with valid 100-character titles, 120-character venues,
200-character addresses, and long description URLs. Document widths reached 2956px in
a 375px viewport and 3680px in a 1440px viewport. After the fix, document widths were
360px and 1425px respectively, with the remaining 15px used by Chrome's scrollbar.
The checks also confirmed that discovery cards containing this content remain within the page.

The scroll bug retained a 1200px list position after opening event details. The updated
build starts new details at 0px and restores the saved list position on Back.
No dependency, API contract, entity type, fixture, token, or shadcn primitive changes were needed.

## Workshop 3 requirement checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| Three connected typed entities | PASS | Users, games, and events have feature-owned types; event organizer, game, and attendee references are checked by the mock suite. |
| Feature-first architecture | PASS | Routes compose domains; inspection and the boundary checker found no cross-feature or reversed layer imports. |
| Mock APIs and TanStack Query hooks | PASS | Components use hooks; API layers own reads/writes; mutations update/invalidate detail and discovery caches. |
| Five required screen types | PASS | Home, discovery, details, reusable create/edit form, and login are implemented and exercised in Chrome. |
| Responsive at 375px and 1440px | PASS | Both widths tested, including long-content regression cases; no remaining horizontal overflow in checked states. |
| Consistent documented tokens | PASS | DESIGN.md matches index.css; approved colors, fonts, radii, and local illustrations are preserved. |
| Complete entity/backend contracts | PASS | Fields, relationships, validation, access, errors, and proposed HTTP endpoints are documented. |
| GitHub-ready README | PASS | Setup, runtime, validation, architecture, features, workflow, and mock limitations match the implementation. |
| Functional frontend without backend | PASS | Journeys run against the production preview; browser checks observed no Fetch/XHR API requests. |

AGENTS.md and root CLAUDE.md were reviewed and preserved. Their shared architecture and
approval rules remain consistent with frontend/CLAUDE.md and the corrected private-read exception.
There are no remaining starter listing screens or create/edit placeholders.

## Executed validation

Commands ran from the repository root using the PowerShell-safe pnpm shim:

| Command | Result |
| --- | --- |
| `pnpm.cmd typecheck` | PASS |
| `pnpm.cmd lint` | PASS, including feature boundaries |
| `pnpm.cmd build` | PASS, production output generated without a chunk-size warning |
| `pnpm.cmd test:mock` | PASS, 10 tests reported, zero failures/skips |
| `git diff --check` | PASS |

The mock suite exercises catalog/reference consistency, clone isolation, validation,
host authorization, private access and revocation, filters, CRUD, concurrent final-seat
joins, repeat join/leave idempotency, session fallback, safe return paths, and closed events.
Typecheck, lint, and build also passed after the two UI fixes. Mock/API code was unchanged.

## Browser journeys and visual review

The production build was served with `pnpm.cmd --filter frontend preview --host 127.0.0.1`.
Playwright was not available in this session. Chrome was automated through its DevTools
Protocol using temporary Node scripts and fresh browser profiles; no test dependencies
or production test hooks were introduced. Screenshots were also inspected visually.

| Journey or check | 375px | 1440px |
| --- | --- | --- |
| Home, featured public events, categories, and navigation | PASS | PASS |
| Title search, city/game/availability, combined filters, reset, and empty results | PASS | PASS |
| Multiple details, invalid/missing IDs, full/past/canceled/unlisted states | PASS | PASS |
| Demo login, current-user navigation, refresh restoration, and logout | PASS | PASS |
| Protected-route redirects, return paths, and non-host editor denial | PASS | PASS |
| Join/leave and immediate visible seat-count changes; full-event prevention | PASS | PASS |
| Public creation, details navigation, filtered discovery, host editing, updated cards | PASS | PASS |
| Required fields, dates, capacity, age, and tag validation; values retained on failure | PASS | PASS |
| Private discovery exclusion, authorized reads, and access after leaving | PASS | PASS |
| New-route scroll reset and Back restoration | PASS | PASS |
| Long content in details/cards without horizontal overflow | PASS | PASS |
| Skip link, keyboard search/profile selection, radio focus, first invalid-field focus | PASS | PASS |
| Input labels, accessible control names, and one main heading per required screen | PASS | PASS |

Additional simulated failures checked list/detail recovery, image fallback, game catalog
error/empty states, login failure/retry, and form save failure/retry. Loading, disabled,
and success states were checked during the relevant flows. Pointer hover feedback for
navigation links and primary actions was checked at both widths. Browser suites reported
33 discovery/participation captures, 37 management captures, and 19 supplemental captures
on the final build, with no application console/runtime errors or API Fetch/XHR requests.
Artifacts are temporary, under the system temporary directory in
`rollcall-event-discovery-review`, `rollcall-event-management-review`, and `rollcall-final-review`.

The mobile navigation intentionally exposes links on a second row, as DESIGN.md specifies;
there is no collapsible menu to test. Token contrast calculations for the eleven checked
text/surface pairs exceeded 4.5:1 (lowest checked ratio 6.42:1). This is a basic
accessibility check, not a full WCAG or screen-reader certification.

## Focused regression steps

1. Build and preview, then open Chrome at 375px and 1440px. Choose a demo host and create
   a public event. Use long unbroken title/venue/address values within the documented limits
   and a long URL in the description. Verify details and discovery remain readable and
   `document.documentElement.scrollWidth <= window.innerWidth`.
2. Scroll discovery down, open an event using its card, and verify the new screen starts
   at the top. Use browser Back and verify the list restores its prior scroll position.
3. Tab to Skip to content and activate it. Submit search with Enter, choose a demo profile
   with the keyboard, and submit an empty create form. Verify visible focus and focus on
   the first invalid field. Refresh to verify session restoration, then log out.

These browser regression steps were executed during this review. The existing mock suite
remains the automated contract regression runner; no additional test framework was added.

## Limits and next-workshop handoff

- Event changes reset on reload. Only the selected demo identity survives within the tab;
  blocked storage falls back to runtime memory. Tests deliberately respect this lifecycle.
- Demo identities and private access checks provide no real authentication or security.
  Another browser/tab does not share event mutations. No HTTP backend or database exists.
- Private events do not accept new players, and there are no invitations. A new private
  event is initially host-only. Unlisted events remain accessible by direct link.
- Removal is API-only; there is no deletion, invitation, cloud upload, payment, recurring-event,
  review, comment, badge, or administration UI. Minimum age is informational guidance.
- Other browsers, physical devices, a full screen-reader audit, a clean-machine install,
  and deployed-host behavior were NOT TESTED. No broader certification is claimed.

No further confirmed frontend fix is required before Workshop 3 submission within the
requested scope. Workshop 4 should replace mocks with authenticated server-owned identity,
durable storage, foreign keys, unique attendance, and transactional capacity enforcement,
using docs/entities.md as the starting contract. Those backend capabilities remain future work.
