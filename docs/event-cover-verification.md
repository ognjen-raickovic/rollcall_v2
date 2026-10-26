# Milestone 4D: event cover verification

Verified locally on 26 October 2026 on `feat/event-cover-storage`. This delivery adds
persistent event covers to the existing frontend/backend. No hosted Supabase resources,
production deployment, private codes or administration were changed. No branch switch,
commit, push or merge was performed.

## Implemented files and behavior

- Migration: `supabase/migrations/20261026000100_event_covers.sql`.
- SQL security/lifecycle suite: `supabase/tests/database/event-covers.test.sql`.
- Local setup: `backend/scripts/setup-event-covers.ts`, root/backend `covers:setup`, ignored
  server operation-key configuration and its validated environment/example entry.
- Backend event module: `event-cover-image.ts`, `event-cover-schema.ts`,
  `event-cover-repository.ts`, `event-cover-routes.ts`; existing event schema/routes and
  app registration/database RPC types updated. Dependencies: `@fastify/multipart`, `sharp`.
- Frontend event module: `persistent-event-covers-api.ts`,
  `use-persistent-event-covers.ts`, `persistent-event-image.tsx`; existing picker validation,
  form controller/presentation, cover metadata, cards/details and action invalidation updated.
- Shared HTTP adds FormData support without JSON encoding or a manual multipart boundary;
  cover access keys and existing Auth transition cleanup are integrated.
- Tests: backend `event-covers.test.ts`, integration `event-covers.test.ts`, frontend
  `check-event-covers.mjs`/`test:event-covers`, real `event-covers-ui.spec.mjs`; prior action
  browser expectations updated for the restored file picker.
- README/SPEC, shared Codex/Claude rules, frontend design, entities, API/schema/architecture,
  roadmap, backend setup and [cover implementation](event-covers.md) document the final scope.

Four image endpoints implement upload, removal, signed access and bounded recovery. Existing
event deletion queues and attempts Storage cleanup. The private bucket enforces 3 MiB and
an image MIME allowlist. Backend decoding validates actual JPEG/PNG/WebP content, matching
MIME/extension, dimensions, corruption and frame count, then produces metadata-free WebP
within 1600px. Source limits are 8192px/edge, 16 million pixels; processing permits two
concurrent decoders and a five-second native timeout.

No unrestricted service-role client exists. A verified user's JWT plus a server-only
operation key authorize exact reserved paths; SQL stores only the key hash. Only the
backend may sign, for 60 seconds, and current event permissions still govern signing/read.
Private outsiders cannot obtain a URL or bypass RLS by guessing a path. Public/unlisted
reads work without exposing those events through Storage listing. Normal content PATCH
preserves the image and cannot attach another event's object.

Replacement commits a validated new association before retiring the old file. Removal
restores the game illustration. Cleanup is event-scoped, at most 20 objects and three
seconds per call, with durable failures, explicit retry and late-upload tombstones. A lost
commit acknowledgement cannot cause compensating deletion of the active cover.

## Executed tests

| Check | Result |
| --- | --- |
| Focused frontend cover contracts/cache | 8 passing Node entries (7 scenarios plus parent) |
| Existing frontend real read/action clients | 8 + 12 passing entries |
| Backend unit suite | 39 passed, including 5 new cover groups |
| Actual local API/Storage/database integration | 22 passed, including 6 cover entries |
| Local SQL security suites | 341 assertions passed across 7 files |
| Cover browser matrix | 5 passed; 3 intentional skips of the focused edge case outside desktop dark |
| Existing real event read/action/Auth/profile browser scenarios | 10 passed at 1440px dark |
| Existing geography/numeric demo browser suite | 3 passed at 1440px dark with tracing disabled |
| Numeric mock lifecycle | 12 passing Node entries |
| Frontend/backend typecheck, lint/boundaries, build | Passed |
| Local SQL lint | No errors or warnings |
| Real separate-transaction capacity checks | Both passed |

The final raster-signature guard and metadata timeout were followed by another five-group
backend cover unit run and six-entry actual Storage integration run; both passed. All
workspace checks passed again afterward.

The traced legacy four-country demo scenario exceeded its existing five-second city-fetch
timeout. Direct API and untraced browser/proxy requests returned in about 20–80 ms, and the
scenario plus all three geography/demo checks passed with `--trace=off`. Application timeouts
were not increased and geography code/data was not changed. This is a local tracing
limitation, not a claimed passing traced run. Reproduce that suite using
`pnpm --filter frontend exec playwright test tests/location-ui.spec.mjs --project=1440-dark --trace=off`.

Client/unit tests use mocked transports and verify validation, safe error projection,
multipart payloads, exact event/version/origin, bounded expiry, account changes, cancellation
and cache isolation. They are separate evidence from the actual persisted integration.

The real integration uses local Auth registration/confirmation and real HTTP/Storage APIs:

- JPEG, PNG and WebP upload; decoded WebP retrieval proves 1600px bounds and EXIF removal.
- Anonymous/non-host/forged actor rejection; malformed/mismatched/corrupt/oversized uploads.
- Direct Storage upload, signed upload, long-TTL signing and listing denial.
- Cross-event attachment and malformed paths rejected even with the internal operation key.
- Anonymous public and direct unlisted access; private host/member access and outsider denial.
- Leaving private membership and visibility changes reject newly requested access.
- An already-issued URL remains temporarily usable, documenting the residual lifetime.
- Replacement/removal/delete physically remove the retired objects through Storage APIs.
- Injected transport failures around real Storage/DB requests prove old-cover preservation,
  lost-commit acknowledgement safety, durable cleanup failure and scoped recovery.

The actual Chromium workflow runs at 375px and 1440px in light/dark themes. A real account
creates an event with a selected cover; details, discovery and homepage show the fetched
Storage image. Reload preserves it. Editing replaces the image and verifies the old object
is gone, then removal restores the default. A private event's cover is visible to its host
but absent for another account; deletion cleans its actual Storage objects.

The focused desktop scenario rejects a bad file, simulates an unavailable upload after a
successful real event create, verifies one database event, then retries only its image.
It observes a real automatic signed-access refresh, tests private participant departure,
and holds an actual authorized response while switching accounts. The late response cannot
restore protected images; logout removes them. The refresh test explicitly foregrounds
Chromium because background polling is intentionally disabled.

Screenshots of custom details and replacement forms were captured for all four viewport/
theme combinations; representative mobile/light and desktop/dark images were visually
reviewed. Width overflow is asserted, loaded images are checked and unexpected console/
page errors are rejected. Traces are off to avoid recording session headers or signed URLs.
Artifacts stay in ignored `frontend/.tmp` paths.

## Local execution and data preservation

The initial local stack lacked a running Storage container. Docker Desktop was started;
the partial stack was stopped with backup and restarted with Storage. An old stopped mail
container was retained under a backup name to resolve its naming conflict. Database volumes
were preserved; no reset or GeoNames import occurred.

The additive migration and key setup ran locally. Initial live testing identified missing
digest-schema privileges; review also identified a direct-signing route around the short
lifetime. Both were corrected in the final migration and synchronized locally through
the same grants/function/policy definitions. Existing data and file metadata were preserved.
Final SQL and actual Storage tests passed afterward. No file objects were simulated through
SQL metadata writes. CLI startup unexpectedly emitted local connection configuration once;
later CLI output was filtered, and no such configuration was saved in tracked artifacts.

SQL lint additionally caught a real-time reservation-expiry helper marked STABLE. Its final
declaration is VOLATILE, matching `clock_timestamp()` and retaining actual-time expiry checks.
The corrected definition was synchronized locally; SQL lint, all 341 assertions and both
concurrency checks passed afterward.

Final aggregate counts match the starting baseline: 46,243 cities, 23,401 aliases and 8 games;
zero Auth accounts, profiles, events and memberships. The private cover bucket contains zero
remaining test objects, and there are zero pending/active/cleanup image records. Temporary
file removal used Storage APIs; only test-owned application audit records were removed by
fixture cleanup. The private bucket configuration and local operation-key hash remain ready
for development.

Use [local setup and commands](event-covers.md) to reproduce. Enable
`RUN_LOCAL_EVENT_COVERS_UI=true` for `tests/event-covers-ui.spec.mjs`, and
`RUN_LOCAL_INTEGRATION=true` for `backend/tests/integration/event-covers.test.ts`. Tests
refuse remote fixtures, create temporary accounts/events, and clean physical Storage files
before removing their own synthetic application records.

## Remaining boundaries

- Issued signed URLs have up to 60 seconds of residual access. They cannot recall downloaded
  image pixels; new access requests enforce current permissions.
- Database/Storage writes are not one distributed transaction. A lost response may follow a
  successful commit. The UI retains its saved event UUID and avoids duplicate creation;
  lifecycle records and scoped cleanup handle interrupted image operations.
- Cleanup does not scan all users/events. Retained tombstones grow with image history;
  retention/account-deletion maintenance needs a separately reviewed policy. Resolve pending
  cleanup before removing the original host identity.
- Local loopback setup is implemented; hosted secret provisioning/rotation, migration rollout,
  deployment and cross-region/CDN behavior were not tested or performed.
- Browser execution used local Chromium. No claim of exhaustive browser/device/accessibility
  coverage or public production readiness is made. Profile-picture uploads, private codes and
  administration remain outside scope.

Milestone 4D is ready for PR review with these documented local verification/rollout boundaries.
No changes are staged or committed.
