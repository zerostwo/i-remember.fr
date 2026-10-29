# API

New HTTP clients should use the TypeScript API app in `apps/api`.

## Versioned Routes

- `GET /api/v1/memories`
- `POST /api/v1/memories`
- `GET /api/v1/memories/:id`
- `PATCH /api/v1/memories/:id`
- `DELETE /api/v1/memories/:id`
- `GET /api/v1/search`
- `POST /api/v1/agent`
- `GET /api/v1/dashboard`
- `GET /api/v1/users`
- `GET /api/v1/comments`
- `POST /api/v1/comments`
- `PATCH /api/v1/comments/:id`
- `DELETE /api/v1/comments/:id`
- `GET /api/v1/pages`
- `POST /api/v1/pages`
- `GET /api/v1/pages/:slug`
- `PATCH /api/v1/pages/:slug`
- `DELETE /api/v1/pages/:slug`
- `GET /api/v1/menu-items`
- `POST /api/v1/menu-items`
- `PATCH /api/v1/menu-items/:id`
- `DELETE /api/v1/menu-items/:id`
- `GET /api/v1/public/menu`
- `GET /api/v1/public/menu-target/:id`
- `GET /api/v1/settings`
- `PUT /api/v1/settings`
- `GET /api/v1/assets`
- `POST /api/v1/assets`
- `GET /api/v1/assets/:key*`
- `POST /api/v1/assets/register`
- `POST /api/v1/assets/reconcile`
- `GET /api/v1/media/:id`
- `DELETE /api/v1/media/:id`
- `GET /api/v1/public/random?current=<public-id>&seen=<comma-separated-public-ids>`
- `POST /api/v1/auth/setup`
- `POST /api/v1/auth/login`

`POST /api/v1/assets` accepts an admin-authenticated JSON body:

```json
{
  "key": "admin/unique-example.jpg",
  "contentBase64": "...",
  "contentType": "image/jpeg",
  "metadata": {}
}
```

Every upload creates an independent MediaAsset; optional `memoryId` also attaches
it to an ordinary Memory. Keys cannot overwrite an existing stored file. The admin
uses unique `admin/` keys. `POST /assets/register` inventories a completed local
video/audio/Live Photo upload. `POST /assets/reconcile` inventories completed local
`admin/` files and `posts/revival-*` media families, skipping recent/incomplete files.
It does not delete files or resurrect deleted registry entries.

`GET /assets` accepts `limit` (up to 200), `cursor`, `q`, `kind`
(`image`, `video`, `audio`, `live`, `file`) and `unused=true`, returning
`pagination.total` and `pagination.nextCursor`. `GET /media/:id` returns current
Memory/Page usage, including draft/archived owners. `DELETE /media/:id` requires
admin authentication and zero references; otherwise it returns `409 asset_in_use`.
Deleting a local media family removes its crops, full photo, motion and download
components together. Retired registry IDs prevent an in-flight save from restoring
a reference to a deleted file. Unsupported/external storage locations are not
eligible for deletion. Removing a Memory attachment only detaches it.

The migration inventories existing attachments and Markdown upload references;
old unreferenced files can be recovered with the inventory action. Media and
reference tables are included in PostgreSQL backups; content-only JSON exports
also retain library records but do not contain the file bytes.

`POST /api/v1/agent` is the first-pass HTTP agent surface. It accepts an
anonymous or authenticated JSON body like `{"query":"Paris","limit":5}` and
returns a deterministic answer plus `/memory/:id` citations from public,
published memories. It does not expose MCP or call an external model yet.

`POST /api/v1/auth/setup` creates the first Prisma `ADMIN` user only when the
user table is empty. It accepts a valid email and a password of at least eight
characters. The endpoint is globally rate limited and becomes unavailable as
soon as the first user exists. Complete setup on a trusted network before
exposing the deployment publicly.

`POST /api/v1/auth/login` checks Prisma users first using the stored
`pbkdf2$iterations$salt$hash` password format and issues a signed bearer token
with the user's role. `AUTH_SECRET` signs those tokens and encrypts persisted
two-factor secrets; it is not itself an API bearer token. The single-image
entrypoint generates and persists this secret when the deployment does not
supply one.

`PATCH /api/v1/memories/:id` is admin-only and accepts partial edits, including
moderation status changes to `NORMAL`, `PENDING`, `ARCHIVED`, or `REJECTED`.

`GET /api/v1/memories` defaults to public `NORMAL` memories. Admin clients can
pass `status=PENDING`, `status=REJECTED`, `status=ARCHIVED`, `status=all`,
`visibility=PRIVATE`, or `visibility=all` with a bearer token for management
views. `offset`, `sort=views_asc|views_desc`, `longForm=true` and `summary=true`
serve bounded admin lists; edit a memory only after fetching its full detail.
Search uses a PostgreSQL generated document with the standard `und-x-icu`
collation to preserve Unicode letters while normalizing accents and separators.
Published UNLISTED records are accessible through direct links and aliases, but
are excluded from collection, random and agent discovery. PRIVATE and non-published
records remain admin-only. Mutating a managed Page mirror returns
`409 page_managed_memory`; edit or archive the Page instead.

Page create/patch accepts `navigationVisible`; page, public mirror and the footer
link update in one transaction. A configured link is not exposed until the Page
is published. Page Markdown upload references participate in media usage checks.

Memory create and patch bodies may include `tags` and `attachments`; memory
responses include both relation lists. Admin-authenticated import/sync clients
may set or change `publicId`: use 4–32 case-sensitive letters, digits or hyphens,
starting with a letter. New IDs default to eight cryptographically random
alphanumeric characters; uniqueness is enforced in PostgreSQL with retries for
random collisions. An ID already assigned to another memory (including a previous
ID) returns `409 public_id_taken`. Empty IDs on PATCH and invalid formats return
`400 invalid_public_id`; pure numeric IDs remain invalid.

Changes preserve all previous IDs as aliases. The API resolves an alias to the
current memory and returns its current `id`. Public HTML routes redirect to the
current canonical `/memory/:id` with HTTP 301, preserving display-language queries.
Aliases obey the same visibility/status checks as current IDs. Map identity,
attachments, views and the database identity do not change when a URL changes.
Existing long IDs remain usable; the schema migration reserves them before any
renames. Admin editors expose this through the Public ID field.

`GET /api/v1/dashboard` is admin-only and returns total memories, moderation
counts, total users, and recent memory activity.

`/api/v1/pages`, `/api/v1/menu-items`, and `/api/v1/settings` are
admin-authenticated production content-management APIs backed by PostgreSQL.
Pages accept Markdown in `bodyMarkdown`; menu items cover footer navigation
targets (`PAGE`, `MEMORY`, `SEARCH`, `EXTERNAL`, `TERMS`, `CREDITS`,
`LANGUAGE`); settings stores deployment-level JSON values such as default
language and Umami tracking config.

`/api/v1/public/menu` and `/api/v1/public/menu-target/:id` expose only visible
footer menu items plus published page/public memory targets for the public
archive runtime. They do not grant access to admin menu/page management.

`/api/v1/comments` is admin-authenticated and stores the admin moderation queue
for comments. `PATCH` accepts `status` changes to `NORMAL`, `PENDING`,
`ARCHIVED`, or `REJECTED`; `DELETE` archives the comment.

## Architecture

The API app is split into:

- controllers: HTTP request/response translation.
- services: business rules and permissions.
- repositories: Prisma persistence.
- storage: local filesystem or S3-compatible upload/delete/getUrl adapter.
- validation: JSON input parsing and shape checks.
- auth: signed bearer-token auth, bootstrap admin access, and role guards.

Archive visual-shell endpoints remain in `src/server/revival.js` as adapters to
the v1 API; they are not a compatibility contract for old URLs or storage:

- `GET /api/search-posts`
- `GET /api/auto-complete-tags/:fragment`
- `GET /api/related-post-count/:id`
- `POST /api/upload-image`
- `POST /api/post`
- `GET /api/public/menu`
- `GET /api/public/menu-target/:id`

When `API_BASE_URL` is configured, the public archive runtime uses v1 Prisma
data for public memory list/detail rendering, footer menu/page targets, and
anonymous memory submission. It does not fall back to SQLite archive content or
legacy numeric memory URLs, while keeping the archived visual shell unchanged.

### Video upload sessions

Public submissions and the admin editor use the same bounded video upload workflow.
It accepts a total of 500 MB and ten minutes, including behind proxies with smaller
per-request body limits:

1. `POST /api/video-uploads` with JSON `{ "size": <file bytes> }` returns an opaque
   `id` and `chunkBytes` (8 MiB).
2. Send consecutive raw binary parts to `PUT /api/video-uploads/:id/chunks/:index`,
   starting at index zero. All parts must have exactly `chunkBytes` bytes except
   the last, which must contain the exact remaining bytes.
3. `POST /api/video-uploads/:id/complete` starts conversion and returns immediately.
4. Poll `GET /api/video-uploads/:id` until `state` is `complete` or `failed`.
   A completed response contains `result` with the video file ID and attachment.
5. `DELETE /api/video-uploads/:id` releases the temporary session. Completed media
   is retained for the memory submission; cancelling an in-progress conversion
   discards its result when the decoder finishes.

Responses use `{ success, data }`; failures use the public `errorMsg`. Mutations
require the same origin, session creation is rate-limited, and at most two
unfinished sessions may occupy disk. Sessions expire after 30 minutes of
inactivity and do not survive a server restart. Uploading does not publish a
memory or increment its view count. The direct multipart `/api/upload-video`
endpoint remains available for clients whose proxy supports its total size and
conversion timeout.
