# Persistent event covers: Milestone 4D

RollCall stores real event covers in one **private** Supabase Storage bucket,
`event-covers`. Fastify receives and validates source files; the browser never uploads
directly to Storage. Event JSON writes cannot attach arbitrary object paths. Numeric
development demos retain separate, nonpersistent cover handling.

## Local setup

Use the existing ignored backend/frontend environment files and local Supabase project.
From the repository root:

```powershell
pnpm install
pnpm db:start
pnpm exec supabase db push --local
pnpm covers:setup
pnpm dev:backend
# Separate terminal:
pnpm dev
```

The additive migration `20261026000100_event_covers.sql` creates bucket configuration,
Storage policies, protected application records and checked functions. It preserves
existing events, memberships, addresses and geography. It does not fabricate or delete
Storage object metadata. File writes/removals always use supported Storage APIs.

`pnpm covers:setup` is explicitly loopback-only. It generates a random server-only
`EVENT_COVER_OPERATION_KEY` in ignored `backend/.env` and inserts only its SHA-256 hash
into `private.event_cover_config`. It prints no credentials and refuses implicit key
rotation or conflicting configuration. Restart Fastify afterward. No service-role key,
JWT signing secret, Storage worker account or browser secret is needed.

If the local stack was started with Storage excluded, check `docker ps` for a healthy
`supabase_storage_rollcall`. The CLI can report an already-running partial stack without
adding missing services. A normal local stop/start preserves database volumes; do not use
`--no-backup`, remove data volumes, reset the database or rerun the geographic import.
An old stopped mail container may conflict with a newer CLI service; preserve/rename it
rather than deleting application data. CLI startup/status output can contain credentials:
do not paste it into Git, diagnostics or chat.

Setup intentionally refuses remote connections. Hosted setup, origin/Auth configuration,
operation-key provisioning/rotation and deployment require a separate reviewed delivery.

## HTTP contracts

All event parameters are UUIDs. Authenticated operations use the existing verified
Supabase bearer guard, deriving the actor from the token. Query/body allowlists reject
submitted owners, paths, attendees and other unexpected fields.

| Method/path | Request | Result |
| --- | --- | --- |
| `POST /api/events/:eventId/cover` | Host bearer; multipart with exactly one `file` and no fields | `{eventId,cover,cleanupPending}` |
| `DELETE /api/events/:eventId/cover` | Host bearer; empty payload | Same result with default cover |
| `GET /api/events/:eventId/cover-url` | Optional verified bearer; current event read permissions | `{eventId,version,imageUrl,expiresAt,visibility}` or null if default |
| `POST /api/events/:eventId/cover/cleanup` | Original host bearer; empty payload | `{eventId,cleanupPending}`; bounded retry works after event deletion |

Missing/inaccessible events share 404. Non-host writes cannot affect another event;
malformed/unsupported/corrupt files produce safe field errors. Oversized files return 413.
Busy/unavailable processing or dependencies return sanitized 503. Errors use the existing
`{code,message,fields}` convention; image messages use `fields.image`.

Normal event metadata contains a local fallback, never a signed URL or Storage path:

```ts
type Cover =
  | { kind: 'default'; imageUrl: LocalGameIllustration }
  | { kind: 'custom'; version: UUID; imageUrl: LocalGameIllustration }
```

The existing `coverStoragePath` field still accepts only null/omission in normal JSON
create/edit. A legacy null marker in content PATCH now preserves the existing cover;
only the checked cover removal workflow clears it. Game changes retain a custom cover,
while its fallback illustration follows the selected game.

## Validation and processing

The existing picker checks source size, type, extension, image signatures and dimensions,
then prepares a preview. These client checks improve feedback; the server independently
validates the received file and re-encodes its decoded pixels.

- JPEG, PNG and WebP only; matching declared MIME, extension and actual decoded format.
- Source and stored size at most 3 MiB; one multipart file, zero extra fields.
- Source at most 8192px on either edge and 16 million pixels; one frame only.
- Sharp handles EXIF orientation and produces WebP quality 82, preserving aspect ratio
  within 1600 × 1600, without enlargement or retained EXIF/other source metadata.
- Two concurrent decoders per API process and a five-second processing timeout bound
  resource use. Storage independently enforces bucket MIME/size restrictions.
- SVG, other formats, corrupt/empty data, mismatches and excessive dimensions are rejected.
- Original filenames are used only for validation, never as Storage paths or log fields.

Only canonical WebP files are associated. The private bucket accepts the three image MIME
types for explicit format restrictions; its RLS prevents direct client writes that could
bypass canonical processing.

## Authorization and signed access

Runtime clients use the existing unprivileged Supabase key. Backend cover writes attach
the verified user's bearer plus an internal `x-rollcall-cover-key` header. RLS and checked
RPCs verify the hash of this second factor and current ownership. Incoming caller headers
are not forwarded as trusted capability values. The key grants no service-role bypass:
the acting host, exact reservation/path and lifecycle state must still match.

The existing `rollcall_events_executor` remains NOLOGIN/NOBYPASSRLS, with explicit narrow
grants, RLS and hardened empty-search-path functions. Config/manifest tables have no
client-role table grants. Public wrappers are security invoker; checked private functions
use the non-bypass executor. Raw event/location/attendance restrictions remain intact.

Storage SELECT requires an active object currently associated with a readable event:

- Public: anonymous visitors can view the cover.
- Unlisted: direct-link access follows event details; no discovery/listing exposure.
- Private: only the verified host/current participant can download or obtain access.

Operation-aware policies deny listing, signed uploads, upsert, overwrite, move/copy and
unregistered paths. Signing additionally requires the backend operation capability. This
prevents an ordinary authorized reader from requesting an arbitrary long-lived signed URL
directly from Storage. Authenticated downloads remain subject to current viewer RLS.

Fastify signs for **60 seconds** after checking access. The access response is `no-store`
and varies on Authorization. Already issued bearer URLs may remain usable for their
remaining lifetime after visibility changes or leaving; they are not instantly revocable.
New access requests recheck permissions. Previously downloaded pixels cannot be recalled.
See official [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[Storage policies](https://supabase.com/docs/guides/storage/security/access-control),
[operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions) and
[signed URL behavior](https://supabase.com/docs/guides/storage/serving/downloads).

## Association and lifecycle

`private.event_cover_objects` records a server-generated
`<eventUUID>/<randomVersionUUID>.webp` path, original host/event IDs, version, timestamps
and lifecycle state. A partial unique index allows one active object per event. The
existing event reference gains a manifest FK. Normal clients cannot edit these records.

1. Reserve a unique pending path after locking/checking the host event.
2. Upload normalized bytes through Storage with no upsert.
3. Commit under the event lock, verifying the actual canonical object metadata.
4. Atomically switch the event association and retire the old active path.
5. Remove retired files through Storage and mark their manifest tombstones deleted.

A failed upload/association never destroys the working old cover. Abort marks only a
pending reservation; if commit succeeded but its response was lost, the now-active cover
cannot become eligible for compensating deletion. Concurrent cleanup/commit checks share
the parent lock. Storage DELETE and completion reject currently associated paths.

Removal clears the association first, returning the game fallback, then cleans the retired
file. Event deletion queues active/pending paths in a database trigger; the API then runs
cleanup after the existing delete transaction. SQL never makes external file requests.

Cleanup processes at most 20 event-scoped objects within an aggregate three-second budget.
Failures preserve durable work, return `cleanupPending:true`, or add
`X-Event-Cover-Cleanup: pending` to an otherwise successful event deletion. The cleanup
endpoint permits safe retries by the original host; it returns no object paths. Pending
reservations older than 15 minutes become recoverable. Tombstones preserve authority to
remove a late interrupted upload that reappears. Work is scoped and prioritized, with no
global scanner. The API does not claim a failed cleanup undid a successful association.

If dependency failure leaves cleanup pending, retry the event's cleanup endpoint after
service recovery. Use the normal authenticated API; do not manually delete
`storage.objects` rows. Account deletion/retention tooling is a future milestone; avoid
removing the original host identity before resolving pending file cleanup.

## Frontend and cache behavior

Real forms reuse `EventCoverInput` and the existing semantic tokens/layout. Draft previews
stay in memory outside the JSON event mapper. Creation saves metadata first, retains the
returned UUID, then uploads the selected cover. Image failure clearly reports partial
success, retains values and offers Retry cover/View saved event. Retry sends the image to
the saved UUID instead of creating another event. Standard content retry updates that same
saved event if necessary. Duplicate submission is disabled during preparation/save/upload.

`PersistentEventImage` resolves a custom marker on cards, details and editors. Failed
access/image loads show the default illustration. Active cover queries use event/viewer/
version keys, 40-second freshness and a 45-second foreground refresh; inactive retention
is zero. A failed image can trigger one bounded recovery refresh, avoiding an error loop.
Public card queries use anonymous scope; protected details/editors use the verified viewer.

Auth transitions clear cover queries before changing accounts. Mutations capture their
initiating viewer and reject late responses, cancel old capabilities and refresh affected
details/lists. Leave suppresses participant cover access while pending/ambiguous; private
departure removes it and navigates away. No tokens or signed URLs enter query keys, logs,
analytics or persistent browser storage. Demo numeric forms/caches remain separate.

See [verification](event-cover-verification.md) for executed tests and remaining boundaries.
