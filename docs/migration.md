# Migration Plan

## Phase 1: Analyze Existing Code

Completed. The public galaxy is a legacy static/runtime experience served by
`server.mjs` and `src/server/revival.js`.

## Phase 2: Extract Visualization Boundary

Completed for the current refactor. `packages/memory-engine` exposes
`MemoryGalaxy` and galaxy data normalization without changing the legacy visual
runtime.

## Phase 3: Create New Backend

Completed for the current refactor. `apps/api` is a TypeScript REST service
with controller, service, repository, validation, auth, and Prisma persistence
boundaries.

## Phase 4: Migrate Database

Completed for the current refactor. `packages/database/prisma/schema.prisma`
defines the PostgreSQL schema. `scripts/migrate-sqlite-to-postgres.mjs` imports
legacy SQLite users, memories, attachments, tags, memory/tag joins, pages, menu
items, and app settings into Prisma-backed PostgreSQL.

```bash
pnpm db:migrate
pnpm db:migrate:legacy -- --dry-run
pnpm db:migrate:legacy
```

SQLite import remains available as migration source material. Runtime
compatibility with previous legacy URLs or storage is not required for this
early prototype.

## Phase 5: Replace Old Admin

Completed for the current refactor. `apps/admin` owns the admin entry point
while reusing the approved admin UI to avoid visual churn, and admin writes
mirror Memory, Page, Menu, Settings, Attachment, and Comment data to the v1
backend where applicable.

## Phase 6: Remove Deprecated Code

In progress. Public archive memory list/detail rendering and anonymous memory
submission now prefer the v1 API when `API_BASE_URL` is configured. Continue
removing deprecated runtime paths as menu, media, and remaining archive
endpoints are proven against v1; do not preserve legacy compatibility solely for
old data or URLs.
