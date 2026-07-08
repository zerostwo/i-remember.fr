# Migration Plan

## Phase 1: Analyze Existing Code

Completed. The public galaxy is a legacy static/runtime experience served by
`server.mjs` and `src/server/revival.js`.

## Phase 2: Extract Visualization Boundary

In progress. `packages/memory-engine` exposes `MemoryGalaxy` without changing
the legacy visual runtime.

## Phase 3: Create New Backend

In progress. `apps/api` is a TypeScript REST service with controller, service,
repository, validation, auth, and Prisma persistence boundaries.

## Phase 4: Migrate Database

In progress. `packages/database/prisma/schema.prisma` defines the PostgreSQL
schema. `scripts/migrate-sqlite-to-postgres.mjs` imports legacy SQLite users,
memories, attachments, tags, memory/tag joins, pages, menu items, and app
settings into Prisma-backed PostgreSQL.

```bash
pnpm db:migrate
pnpm db:migrate:legacy -- --dry-run
pnpm db:migrate:legacy
```

Legacy SQLite remains as a compatibility layer until archive reads and writes
are fully moved.

## Phase 5: Replace Old Admin

In progress. `apps/admin` now owns the admin entry point while reusing the
current admin UI to avoid visual churn.

## Phase 6: Remove Deprecated Code

Pending. Remove legacy API and SQLite code only after public archive parity and
data migration are proven.
