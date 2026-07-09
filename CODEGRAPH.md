# Codegraph

Use this as the repo map before editing.

## Runtime Flow

```text
pnpm dev
  -> turbo run dev --parallel
  -> apps/web boundary via vite.config.mjs
  -> apps/api/src/server.ts

pnpm start
  -> server.mjs
  -> createRevivalMiddleware({ production: true })
  -> /api/v1/* proxy to API_BASE_URL when configured
  -> non-legacy /uploads/* proxy to API_BASE_URL when configured
  -> dist static fallback

apps/api
  -> createApiV1Middleware()
  -> controllers
  -> services
  -> repositories
  -> Prisma/PostgreSQL
  -> storage adapter
```

## Monorepo Boundaries

- `apps/web`: public website boundary and `MemoryGalaxy` export.
- `apps/admin`: React admin entry using the approved admin UI.
- `apps/api`: standalone TypeScript REST API for `/api/v1/*`.
- `packages/memory-engine`: reusable galaxy component and memory normalization.
- `packages/database`: Prisma schema, migrations, and PostgreSQL client.
- `packages/storage`: local and S3-compatible asset storage adapters.
- `packages/types`: shared API/domain TypeScript contracts.
- `packages/ui`: shadcn-style UI primitive exports used by admin.
- `packages/config`: shared routes, roles, and supported languages.
- `docker/`: app-specific Dockerfiles for web, admin, and API.
- `docs/`: architecture, API, database, deployment, and migration notes.

## Public Archive Surface

Treat these as preserved visual/runtime assets unless the user explicitly
approves a visual change:

- `index.html`
- `fr.html`
- `legal.html`
- `public/js/main.js`
- `public/js/revival-runtime.js`
- `public/css/main.css`
- `public/img/*`
- `public/audio/*`
- `public/fonts/*`
- `public/uploads/posts/revival-upload/*.jpg`

The public memory galaxy, particle behavior, card layout, search UI, add-memory
UI, navigation ball, and responsive behavior should remain visually unchanged.

## Public Visual Adapter

- `src/server/revival.js`: public visual-shell middleware, HTML patching,
  upload handling, and v1 API adapters for archive search/detail/menu/submission.

## Production API

- `apps/api/src/index.ts`: route registration and dependency wiring.
- `apps/api/src/controllers.ts`: HTTP DTOs and request/response translation.
- `apps/api/src/services.ts`: business rules, role checks, dashboard summaries,
  first-pass HTTP agent answers, and asset operations.
- `apps/api/src/repositories.ts`: repository interfaces.
- `apps/api/src/prisma-repositories.ts`: Prisma-backed repository
  implementations.
- `apps/api/src/validation.ts`: JSON input validation and coercion.
- `apps/api/src/auth.ts`: bearer token auth, password verification, and role
  guards.
- `apps/api/src/static-assets.ts`: local `STORAGE_PATH` file serving for v1
  upload URLs.

## Admin App

- `admin.html`: root Vite entry for admin.
- `apps/admin/src/main.tsx`: workspace entry that mounts the admin app.
- `src/admin/AdminApp.jsx`: admin routes, data loading, CRUD screens, login,
  settings, 2FA, backup export, and v1 mirroring.
- `src/admin/v1-*.js`: bridge helpers that mirror legacy admin actions into
  the v1 API.
- `src/admin/admin.css`: admin-specific layout and polish.
- `src/components/ui/*.jsx`: local shadcn-style primitives re-exported by
  `packages/ui`.
- `src/index.css`: Tailwind/shadcn theme tokens.

## Build And Deployment

- `package.json`: pnpm scripts and dependency boundary.
- `pnpm-lock.yaml`: locked pnpm dependency graph.
- `pnpm-workspace.yaml`: workspace package list.
- `turbo.json`: task graph for build, test, typecheck, and dev.
- `vite.config.mjs`: React/Tailwind build plus revival dev middleware.
- `docker-compose.yml`: `web`, `admin`, `api`, and `postgres` services; image
  names use `DOCKERHUB_IMAGE` and `TAG`.
- `docker/*.Dockerfile`: per-app container builds.
- `.github/workflows/docker.yml`: DockerHub publishing workflow.
- `.dockerignore`: excludes generated/runtime material from Docker context.
- `.gitignore`: excludes generated/runtime material from Git while allowing
  source migrations and fallback images.
- `.env.example`: supported deployment variables.

## Documentation

- `AGENTS.md`: repo-specific agent/product decisions.
- `README.md`: operator overview.
- `BACKEND.md`: backend architecture notes.
- `docs/architecture.md`: target monorepo architecture.
- `docs/api.md`: v1 API contract.
- `docs/database.md`: Prisma/PostgreSQL schema notes.
- `docs/deployment.md`: Docker deployment notes.
- `docs/migration.md`: phased migration status.
- `REVIVAL_NOTES.md`, `design-qa.md`: restoration and visual QA history.
- `LICENSE`: source-available/third-party material notice.

## Generated Or Local Only

- `dist/`
- `.revival-data/`
- `.revival-storage/`
- `public/uploads/posts/*` except `revival-upload`
- `public/uploads/tmp/`
- `node_modules/`
- `qa/`
- `data/`
- `db/`
- SQLite files

## Edit Targets

- Public route/API behavior: start in `src/server/revival.js`, then check
  `public/js/revival-runtime.js`.
- v1 API behavior: start in `apps/api/src/services.ts`,
  `apps/api/src/controllers.ts`, and `apps/api/src/prisma-repositories.ts`.
- Admin UI behavior: start in `src/admin/AdminApp.jsx`; reuse
  `packages/ui`/`src/components/ui` primitives.
- Public visual shell: prefer `public/js/revival-runtime.js` or server HTML
  patches; edit `public/js/main.js` only as a last resort.
- Docker publish issues: `docker-compose.yml`, `docker/*.Dockerfile`,
  `.github/workflows/docker.yml`, and `.env.example`.
