# API

New HTTP clients should use the TypeScript API app in `apps/api`.

## Versioned Routes

- `GET /api/v1/memories`
- `POST /api/v1/memories`
- `GET /api/v1/memories/:id`
- `PATCH /api/v1/memories/:id`
- `DELETE /api/v1/memories/:id`
- `GET /api/v1/search`
- `GET /api/v1/users`
- `GET /api/v1/assets`
- `POST /api/v1/assets`
- `GET /api/v1/assets/:key`
- `DELETE /api/v1/assets/:key`
- `POST /api/v1/auth/login`

`POST /api/v1/assets` accepts an admin-authenticated JSON body:

```json
{
  "key": "memory/example.jpg",
  "contentBase64": "...",
  "contentType": "image/jpeg",
  "metadata": {}
}
```

The storage layer returns a URL from the configured local filesystem adapter or
an S3-compatible adapter.

`PATCH /api/v1/memories/:id` is admin-only and accepts partial edits, including
moderation status changes to `NORMAL`, `PENDING`, `ARCHIVED`, or `REJECTED`.

`GET /api/v1/memories` defaults to public `NORMAL` memories. Admin clients can
pass `status=PENDING`, `status=REJECTED`, `status=ARCHIVED`, `status=all`,
`visibility=PRIVATE`, or `visibility=all` with a bearer token for management
views.

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
