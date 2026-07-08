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
- `GET /api/v1/settings`
- `PUT /api/v1/settings`
- `GET /api/v1/assets`
- `POST /api/v1/assets`
- `GET /api/v1/assets/:key`
- `DELETE /api/v1/assets/:key`
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
an S3-compatible adapter. When `memoryId` is present, the upload is also stored
as a Prisma `Attachment` for that memory.

`POST /api/v1/agent` is the first-pass HTTP agent surface. It accepts an
anonymous or authenticated JSON body like `{"query":"Paris","limit":5}` and
returns a deterministic answer plus `/memory/:id` citations from public,
published memories. It does not expose MCP or call an external model yet.

`PATCH /api/v1/memories/:id` is admin-only and accepts partial edits, including
moderation status changes to `NORMAL`, `PENDING`, `ARCHIVED`, or `REJECTED`.

`GET /api/v1/memories` defaults to public `NORMAL` memories. Admin clients can
pass `status=PENDING`, `status=REJECTED`, `status=ARCHIVED`, `status=all`,
`visibility=PRIVATE`, or `visibility=all` with a bearer token for management
views.

Memory create and patch bodies may include `tags` and `attachments`; memory
responses include both relation lists.

Migration clients may set `legacyId` and filter `GET /api/v1/memories` with
`legacyId=...`.

`GET /api/v1/dashboard` is admin-only and returns total memories, moderation
counts, total users, and recent memory activity.

`/api/v1/pages`, `/api/v1/menu-items`, and `/api/v1/settings` are
admin-authenticated production content-management APIs backed by PostgreSQL.
Pages accept Markdown in `bodyMarkdown`; menu items cover footer navigation
targets (`PAGE`, `MEMORY`, `SEARCH`, `EXTERNAL`, `TERMS`, `CREDITS`,
`LANGUAGE`); settings stores deployment-level JSON values such as default
language and Umami tracking config.

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
- auth: bearer-token admin auth and role guards.

Legacy endpoints remain in `src/server/revival.js` only for the restored public
archive runtime:

- `GET /api/search-posts`
- `GET /api/auto-complete-tags/:fragment`
- `GET /api/related-post-count/:id`
- `POST /api/upload-image`
- `POST /api/post`
- `GET /api/public/menu`
- `GET /api/public/menu-target/:id`
- `POST /api/admin/*`
