# RollCall MVP polish verification

Completed on 2026-10-22 on `chore/mvp-finalization`, preserving the preceding
[frontend review](frontend-review.md) and all its uncommitted changes. No branch changes,
commits, pushes, merges, new dependencies, backend, or external storage integration were made.

## Implemented changes

- Optional event covers in both forms: JPG/JPEG, PNG, and WebP up to 3 MiB (shown as 3 MB),
  preview, replacement, removal, game-based fallback, and inline file errors. Browser
  preparation caps the longest retained edge at 1600px without upscaling, encodes a bounded
  data URL, and releases decoded bitmaps/canvas buffers. Cards and details use the saved
  imageUrl. Custom images survive game changes and normal edits until explicitly replaced
  or removed. No images enter localStorage/sessionStorage or external services.
- Curated tags: eight canonical EventTag values, no arbitrary input, at most six unique
  selections, removable chips, and an accessible checkbox popover. Experience is authoritative:
  Beginner friendly is valid for all-levels/beginner; Veterans only requires experienced.
  Changes remove incompatible tags with feedback, and merged API validation enforces the
  same rules. Fixtures now use only canonical values.
- Form layout: removed the required/timezone paragraph, preserved required markers and
  local date handling, and aligned the first form and sidebar cards. Desktop tips remain sticky.
- Themes: semantic light tokens alongside the approved default dark palette, a named Sun/Moon
  navbar toggle, localStorage preference (`rollcall.theme`), early HTML initialization, and
  a runtime fallback when storage is unavailable. Theme changes preserve form, session,
  and navigation state. The mobile account name remains visible; its decorative avatar hides
  to make room for the theme control.

## Files and ownership

| Area | Files |
| --- | --- |
| Cover handling | New `events/api/event-covers.ts` and `events/components/event-cover-input.tsx`; updated form defaults, shared schema, submission hook, form, and event-image alt text |
| Curated tags | New `events/event-tags.ts` and `events/components/event-tag-select.tsx`; updated Event types, schema, fixtures, and form |
| Themes/navigation | New `src/lib/theme.ts` and `src/components/layout/theme-toggle.tsx`; updated index.html, index.css, app-layout, and session-menu |
| Regression checks | Updated `frontend/scripts/check-mock-api.mjs` using the existing Node/Vite test tooling |
| Documentation | AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, README.md, SPEC.md, frontend/DESIGN.md, docs/entities.md, and the review documents |

Feature paths in the table are relative to `frontend/src/features/`. No feature imports
another feature. The existing API calls, TanStack Query cache updates, auth guards, and
host permissions remain in place. UI primitives and dependencies were preserved.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm.cmd typecheck` | PASS |
| `pnpm.cmd lint`, including boundaries | PASS |
| `pnpm.cmd build` | PASS; no chunk-size warning |
| `pnpm.cmd test:mock` | PASS; 11 reported tests, zero failures/skips |
| Create without custom image; game-based cover changes | PASS |
| Create with valid JPG, PNG, and WebP; resized preview and saved rendering | PASS |
| Replace/remove custom covers in create and edit; preserve custom covers across game changes | PASS |
| Invalid MIME, oversized files, invalid signatures, and corrupt image decoding | PASS |
| Correct covers on discovery cards and event details after creation/edits | PASS |
| Curated selection/removal, six-tag cap, no duplicates, mutually exclusive experience tags | PASS |
| Prefilled edit images/tags and preservation across theme changes | PASS |
| Removed paragraph and desktop top alignment/sticky sidebar | PASS |
| Light/dark selection, reload persistence, and correct initial paint theme | PASS |
| Every required page in both themes at 375px and 1440px | PASS |
| Login/logout, restored session, filters/reset/empty, create/edit, host denial, join/leave | PASS |
| Full and missing-event states in the light theme at both widths | PASS |
| Console/runtime errors and API/cloud requests in recorded journeys | PASS; zero observed |
| Keyboard Enter/Space selection, Escape close, chip removal focus return | PASS |
| Dropdown viewport containment at 375×812 and desktop width | PASS |
| Bitmap release and no image data in browser storage | PASS |
| Pending image preparation followed by navigation away | PASS; no late errors |
| Invalid stored theme and blocked-storage switching/navigation/reload fallback | PASS |
| `git diff --check` | PASS |

Chrome automated the production preview through DevTools Protocol because Playwright tooling
was unavailable. The primary suite recorded 48 states across the four width/theme combinations;
the focused keyboard/resource/storage suite recorded eight additional states. Full-page and
viewport screenshots were inspected for layout, typography, cover proportions, navigation,
validation, popovers, and theme consistency. Temporary artifacts are under the system temp
directory in `rollcall-mvp-polish-review`; these are not runtime dependencies or committed assets.

The existing contract suite gained curated-tag, experience consistency, bounded image data,
file rejection, saved-image read/list/update, and failed-update isolation checks. It retains
concurrent capacity, idempotent attendance, private access, and session coverage.
The full browser journeys passed before the final focus/alt-text/popover-height adjustments;
typecheck/lint/build and the focused keyboard/mobile/resource checks cover those adjustments.

Calculated contrast for twelve semantic text/surface pairs passes 4.5:1 in both themes:
the lowest checked ratios are 6.42:1 dark and 5.30:1 light. Border/background ratios are
3.14:1 dark and 3.36:1 light. This is basic accessibility verification, not full certification.

## Lifecycle and backend handoff

Event mutations, including custom covers and selected tags, reset on a full page reload.
The selected demo user is tab-scoped; only the theme preference uses localStorage. Images
remain bounded mock strings, with no File objects, object URLs, or cloud credentials retained.
Authentication and access checks remain simulated and provide no server-side security.

Backend picture storage and transport are deliberately undecided. Workshop 4 should agree
on that contract and server validation; the frontend demonstration does not require a storage
provider, upload endpoint, database, or persistent base64 payload. See entities.md for the
mock image representation and explicit future-backend distinction.

Other browsers, physical devices, operating-system file-picker dialogs, deployed hosting,
and a complete screen-reader audit were NOT TESTED. Chrome file tests used browser File
objects through the real input handler. No remaining confirmed blocker was found in scope.
RollCall is ready for review and its final Workshop 3 commit when approved.

## Earlier review commit

Suggested one-line message for the changes present before this polish task:

`chore: finalize frontend review and fix content wrapping and navigation`

That earlier change set consisted of README.md, SPEC.md, docs/entities.md,
frontend/CLAUDE.md, frontend/DESIGN.md, frontend/src/app/routes/root-layout.tsx,
frontend/src/components/layout/app-layout.tsx, and docs/frontend-review.md.
A temporary snapshot of those files and their tracked diff was saved as
`rollcall-before-image-tags-theme-polish` in the system temporary directory before editing.
The current working tree also contains this polish; shared files include both sets of changes.
