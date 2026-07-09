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
defines the PostgreSQL schema. Legacy SQLite test data is intentionally not
preserved.

```bash
pnpm db:migrate
```

SQLite import and runtime compatibility are removed for this early prototype.

## Phase 5: Replace Old Admin

Completed for the current refactor. `apps/admin` owns the admin entry point
while reusing the approved admin UI to avoid visual churn, and admin writes
mirror Memory, Page, Menu, Settings, Attachment, and Comment data to the v1
backend where applicable.

## Phase 6: Remove Deprecated Code

In progress. Public archive memory list/detail rendering and anonymous memory
submission use the v1 API. Do not preserve legacy compatibility solely for old
test data or URLs.
