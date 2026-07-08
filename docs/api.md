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
- `POST /api/v1/auth/login`

## Architecture

The API app is split into:

- controllers: HTTP request/response translation.
- services: business rules and permissions.
- repositories: Prisma persistence.
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
