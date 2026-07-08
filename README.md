# I Remember Revival

Self-hosted revival and personal-blog backend for the restored `i-remember.fr`
frontend.

This repository keeps the public archive UI visually close to the original site,
while moving the engineering foundation toward a pnpm/turbo monorepo with a
TypeScript API, PostgreSQL/Prisma persistence, shared packages, and multi-service
Docker deployment.

## Current Scope

- Public archive frontend with English, French, and Chinese routes; the restored
  galaxy visuals remain the source of truth.
- `apps/api`: versioned REST API at `/api/v1/*` with controllers, services,
  repositories, validation, auth guards, and typed smoke checks.
- `apps/admin`: React admin entry using the Figma-approved admin shell; writes
  preserve the restored archive backend and mirror Memory, Pages, Menu,
  Settings, and Attachment changes into the v1 API where available.
- `apps/web`: public web entry with `packages/memory-engine` for reusable galaxy
  data normalization.
- `packages/database`: PostgreSQL Prisma schema, SQL migrations, and client.
- `packages/storage`: local filesystem and S3-compatible `upload/delete/getUrl`
  adapter.
- Anonymous public memory submission with moderation status; new submissions are
  public immediately unless moderation is explicitly enabled.
- Admin modules for Dashboard, Memory, Pages, Comments, Attachments, Theme,
  Menus, Settings, and Backups.
- Settings for default language, anonymous submissions, and self-hosted Umami
  tracking.
- Legacy SQLite remains only as a compatibility layer for the restored public
  archive while production backend work targets PostgreSQL.

## Runtime

```bash
pnpm install
pnpm build
pnpm test
pnpm start
```

`pnpm dev` runs the web and API workspaces through Turbo. The legacy public
archive server still listens on `PORT` and `HOST`; the default local URL is
`http://127.0.0.1:7890/`.

Admin is available at `/admin/`.

On a fresh database, the first visit redirects to `/admin/setup` so you can
create the first administrator.

The running app exposes its build version at `/version`.

## Docker

```bash
DOCKERHUB_IMAGE=zerostwo/i-remember.fr TAG=latest docker compose up -d
```

Compose provides `web`, `admin`, `api`, and `postgres` services.

## Configuration

Copy `.env.example` into your deployment environment and set at least:

- `DATABASE_URL`: PostgreSQL connection string for `apps/api`.
- `AUTH_SECRET`: bearer-token secret for admin API access.
- `STORAGE_PATH`: local asset storage directory.
- `I_REMEMBER_DATA_DIR`: legacy public archive compatibility data directory.
- `I_REMEMBER_DEFAULT_LANGUAGE`: `en`, `fr`, or `zh`.
- `I_REMEMBER_ANONYMOUS_SUBMISSIONS`: `true` or `false`.
- `I_REMEMBER_AUTO_APPROVE_SUBMISSIONS`: `true` by default so public submissions
  appear in search immediately; set `false` when you want manual moderation.
- `I_REMEMBER_SEED_ARCHIVE_DATA`: set `true` only when you want to import the
  restored public archive into a fresh database.
- `I_REMEMBER_SEED_STARTER_CONTENT`: set `true` only when you want starter
  pages and footer menu items in a fresh database.
- `UMAMI_SRC` and `UMAMI_WEBSITE_ID` for self-hosted Umami tracking.

## Repository Hygiene

Generated or runtime material is intentionally excluded from Git:

- `qa/`
- `data/`
- `db/`
- `.revival-data/`
- `.revival-storage/`
- SQLite files
- `dist/`

SQL migration source lives in `src/server/migrations/sqlite/`.
PostgreSQL migration source lives in `packages/database/prisma/migrations/`.

## Release

- `package.json` is the source of truth for the app version.
- `CHANGELOG.md` records user-facing changes.
- `.github/workflows/docker.yml` publishes `zerostwo/i-remember.fr:<version>`,
  `zerostwo/i-remember.fr:latest`, and `zerostwo/i-remember.fr:sha-<commit>` on
  pushes to `main`.
- Pushing a `vX.Y.Z` tag also publishes `X.Y.Z`, `X.Y`, and `latest`.

## License Position

I did not find an open-source license for the original `i-remember.fr` site in
public search results. The restored original terms included with this project
state that the site structure, software, text, images, video, sound, know-how,
animations, information, and content are owned by the Fondation pour la
Recherche Medicale or used under rights.

Because this repository contains restored original frontend code and assets, the
repository should not be published as MIT, Apache, GPL, or another open-source
license as a whole unless the original rights are cleared.

The practical recommendation for this derivative repository is:

- Keep the repository as source-available with explicit copyright and license
  boundaries.
- Treat restored original frontend code, brand, text, media, fonts, audio, and
  visual assets as excluded third-party material.
- If desired later, split the new backend/admin implementation into a separate
  clean package and license only that package under MIT or Apache-2.0.

See `LICENSE` for the current repository-level notice.
