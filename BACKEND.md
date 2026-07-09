# I Remember Backend

The backend is currently a two-layer bridge:

- The restored public archive still runs through `server.mjs`,
  `src/server/revival.js`, and SQLite so the memory galaxy visual experience
  stays unchanged.
- New production backend work targets `apps/api`, PostgreSQL, Prisma, and the
  shared packages under `packages/*`.

This keeps the archive usable while the engineering foundation moves toward the
refactor document's monorepo architecture.

## Runtime Layers

- Public compatibility server: `server.mjs` serves the built archive/admin app,
  applies the revival middleware, proxies `/api/v1/*` to `API_BASE_URL`, and
  proxies non-legacy v1 upload URLs such as `/uploads/admin/file.jpg`.
- Legacy compatibility backend: `src/server/revival.js` owns public archive
  routes, admin cookie auth, SQLite migrations, image uploads, starter pages,
  footer menu seeding, and backup export.
- Production API: `apps/api` exposes `/api/v1/*` through controller, service,
  repository, validation, auth, and storage boundaries.
- Production database: `packages/database` owns the PostgreSQL Prisma schema,
  migrations, and client.
- Storage: `packages/storage` provides local filesystem and S3-compatible
  `upload`, `delete`, and `getUrl` adapters. The API serves local files from
  `STORAGE_PUBLIC_BASE_URL` when `STORAGE_PATH` is used.
- Shared contracts: `packages/types` and `packages/config` define API shapes,
  route constants, roles, and language support.

## Data Model

Production state is modeled in Prisma:

- `User`
- `Memory`
- `Attachment`
- `Tag`
- `MemoryTag`
- `Comment`
- `Page`
- `MenuItem`
- `AppSetting`

Legacy SQLite remains only for the restored public archive compatibility layer.
Its migration source lives in `src/server/migrations/sqlite`.

## Public Safety Defaults

- Anonymous public memory submission can be disabled through settings or
  `I_REMEMBER_ANONYMOUS_SUBMISSIONS=false`.
- Legacy public submissions default to the site moderation policy controlled by
  `I_REMEMBER_AUTO_APPROVE_SUBMISSIONS`.
- v1 anonymous memory creates are accepted, but pending/private management views
  require an admin bearer token.
- Uploads are capped by `I_REMEMBER_MAX_UPLOAD_BYTES` or
  `API_MAX_JSON_BODY_BYTES` depending on the runtime path.
- User content serialized into legacy inline scripts is escaped before it enters
  the page.
- The restored archive still requires legacy inline/eval-compatible browser
  behavior; tightening CSP requires rebuilding the archived frontend.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm start
pnpm db:migrate
pnpm db:migrate:legacy:check
```

Docker Compose provides `web`, `admin`, `api`, and `postgres` services. Compose
syntax can be validated with:

```bash
docker compose config --quiet
```
