# Architecture

The refactor keeps the public memory galaxy visually unchanged while separating
the engineering foundation into apps and packages.

## Apps

- `apps/web`: public website boundary and `MemoryGalaxy` export.
- `apps/admin`: admin dashboard boundary. The active entry is
  `apps/admin/src/main.tsx`, which reuses the existing approved admin UI.
- `apps/api`: standalone TypeScript REST API with controller, service,
  repository, validation, and auth layers.

## Packages

- `packages/memory-engine`: reusable memory galaxy component boundary.
- `packages/database`: Prisma schema and PostgreSQL client.
- `packages/storage`: local filesystem and S3-compatible storage abstraction.
- `packages/types`: shared API/domain types.
- `packages/ui`: shared shadcn-style component exports.
- `packages/config`: shared route, language, and role constants.

## Preserved Visual Surface

Do not redesign or rewrite these files during backend migration:

- `index.html`
- `fr.html`
- `public/css/main.css`
- `public/js/revival-runtime.js`
- `public/js/main.js`
- `public/img/*`
- `public/audio/*`
- `public/fonts/*`

The legacy SQLite server path stays only to keep that archive surface working
while the Prisma API grows behind it.
