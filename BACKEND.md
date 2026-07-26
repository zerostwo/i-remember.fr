# I Remember Backend

The backend is now PostgreSQL/v1-first:

- The restored public archive still runs through `server.mjs` and
  `src/server/revival.js` so the memory galaxy visual experience stays
  unchanged.
- Runtime data targets `apps/api`, PostgreSQL, Prisma, and the shared packages
  under `packages/*`.

This keeps the archive usable while the engineering foundation moves toward the
refactor document's monorepo architecture. Legacy compatibility is not a
product requirement for this early prototype.

## Runtime Layers

- Public archive server: `server.mjs` serves the built archive/admin app,
  applies the revival middleware, proxies `/api/v1/*` to `API_BASE_URL`, and
  proxies non-legacy v1 upload URLs such as `/uploads/admin/file.jpg`.
- Public visual adapter: `src/server/revival.js` owns public archive routes,
  visual-shell HTML patching, and public upload/submission adapters to v1.
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

SQLite runtime, import, and migration paths have been removed. Legacy URL
compatibility should not be preserved.

## Public Safety Defaults

- Anonymous public memory submission is disabled by default and can be enabled
  explicitly through settings or `I_REMEMBER_ANONYMOUS_SUBMISSIONS=true`.
- Enabled public archive submissions publish immediately as `NORMAL` and
  `PUBLIC`; there is no anonymous auto-approval configuration switch.
- v1 anonymous memory creates are accepted, but pending/private management views
  require an admin bearer token.
- Uploads are capped by `I_REMEMBER_MAX_UPLOAD_BYTES` and encoded asset request
  bodies by `API_MAX_ASSET_JSON_BODY_BYTES`; ordinary JSON bodies use the much
  smaller `API_MAX_STANDARD_JSON_BODY_BYTES` limit.
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
```

Docker Compose provides one `app` service containing Web, API, and embedded
PostgreSQL 15 processes. Compose syntax can be validated with:

```bash
TAG=sha-0123456789ab docker compose config --quiet
```
