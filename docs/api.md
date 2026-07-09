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
- `DELETE /api/v1/assets/:key*`
- `POST /api/v1/auth/setup`
- `POST /api/v1/auth/login`

`POST /api/v1/assets` accepts an admin-authenticated JSON body:

```json
{
  "key": "memory/example.jpg",
  "memoryId": "public-memory-id",
  "contentBase64": "...",
  "contentType": "image/jpeg",
  "metadata": {}
}
```

The storage layer returns a URL from the configured local filesystem adapter or
an injected S3-compatible adapter. Asset keys may include nested path segments
such as `memory/example.jpg`. Local API assets are served from
`STORAGE_PUBLIC_BASE_URL` (default `/uploads`), and the web/admin server proxies
those non-legacy upload URLs to the API when `API_BASE_URL` is configured. When
`memoryId` is present, the upload is also stored as a Prisma `Attachment` for
that memory.

`POST /api/v1/agent` is the first-pass HTTP agent surface. It accepts an
anonymous or authenticated JSON body like `{"query":"Paris","limit":5}` and
returns a deterministic answer plus `/memory/:id` citations from public,
published memories. It does not expose MCP or call an external model yet.

`POST /api/v1/auth/setup` creates the first Prisma `ADMIN` user only when the
user table is empty. The admin shell calls this during first setup so later
admin writes authenticate against the v1 API directly.

`POST /api/v1/auth/login` checks Prisma users first using the stored
`pbkdf2$iterations$salt$hash` password format and issues a signed bearer token
with the user's role. The raw `AUTH_SECRET` bearer token remains accepted for
bootstrap/admin operations, and `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only used
when no matching database user exists.

`PATCH /api/v1/memories/:id` is admin-only and accepts partial edits, including
moderation status changes to `NORMAL`, `PENDING`, `ARCHIVED`, or `REJECTED`.

`GET /api/v1/memories` defaults to public `NORMAL` memories. Admin clients can
pass `status=PENDING`, `status=REJECTED`, `status=ARCHIVED`, `status=all`,
`visibility=PRIVATE`, or `visibility=all` with a bearer token for management
views.

Memory create and patch bodies may include `tags` and `attachments`; memory
responses include both relation lists. Admin-authenticated import/sync clients
may set `publicId` only when it matches the current `m` plus 20 lowercase hex
contract used by language-free `/memory/:id` URLs. Legacy numeric IDs are
rejected by the v1 memory API.

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

Archive runtime endpoints remain in `src/server/revival.js` only until each
path is replaced by the v1 API; they are not a compatibility contract for old
URLs or storage:

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

- `GET /api/admin/export`
- `POST /api/admin/*`

`GET /api/admin/export` is authenticated with the admin cookie and downloads
the current admin archive bundle for the Backups section.
