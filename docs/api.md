# API

Legacy endpoints remain available for the restored public archive runtime:

- `GET /api/search-posts`
- `GET /api/auto-complete-tags/:fragment`
- `GET /api/related-post-count/:id`
- `POST /api/upload-image`
- `POST /api/post`
- `GET /api/public/menu`
- `GET /api/public/menu-target/:id`
- `POST /api/admin/*`

New HTTP clients should use versioned endpoints:

## Memories

- `GET /api/v1/memories?q=term`
- `GET /api/v1/memories/:id`
- `POST /api/v1/memories`
- `PATCH /api/v1/memories/:id`
- `DELETE /api/v1/memories/:id`

Public reads return memory cards with public IDs and language-free URLs.
Anonymous creation stays enabled or disabled through system settings. Patch and
delete are admin-gated; delete archives the memory instead of hard-deleting it.

## Search

- `GET /api/v1/search?q=term`

Search currently uses the existing local text matching. Semantic search,
embeddings, and vector storage remain intentionally unimplemented until the
product decision is revisited.

## Users

- `GET /api/v1/users`

Admin-only. Returns the current admin profile plus the supported role set:
`ADMIN`, `USER`, `ANONYMOUS`.

## Assets

- `GET /api/v1/assets?limit=80`

Admin-only. Returns stored image metadata and public image URLs.
