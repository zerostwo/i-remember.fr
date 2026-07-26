# I Remember Revival

Self-hosted revival and personal-blog backend for the restored `i-remember.fr`
frontend.

This repository keeps the public archive UI visually close to the original site,
while moving the engineering foundation toward a pnpm/turbo monorepo with a
TypeScript API, PostgreSQL/Prisma persistence, shared packages, and one Docker
image for self-hosted production.

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
- Anonymous public memory submission; when enabled, valid submissions publish
  immediately as public memories.
- Admin modules for Dashboard, Memory, Pages, Comments, Attachments, Theme,
  Menus, Settings, and Backups.
- Settings for default language, anonymous submissions, and self-hosted Umami
  tracking.
- Production backend work targets PostgreSQL through Prisma; SQLite and legacy
  compatibility are not product requirements for this early prototype.

## Runtime

```bash
pnpm install
pnpm build
pnpm test
pnpm start
```

`pnpm dev` runs the web and API workspaces through Turbo. The public archive
server still listens on `PORT` and `HOST`; the default local URL is
`http://127.0.0.1:7890/`.

Admin is available at `/admin/`.

On a fresh database, the first visit redirects to `/admin/setup`. The
first-admin form requires the separate bootstrap token persisted as
`/var/opt/i-remember.fr/setup-token`; see the production deployment guide for
the trusted local retrieval command.

The running app exposes its build version at `/version`.

## Docker

Simple self-hosted deployment uses one image and one persistent volume:

```bash
docker run -d \
  --name i-remember.fr \
  -p 127.0.0.1:7892:7890 \
  -v ~/.i-remember.fr:/var/opt/i-remember.fr \
  zerostwo/i-remember.fr@sha256:<verified-manifest-digest>
```

Open `http://localhost:7892`.

The single image starts the public web server, API server, and an internal
PostgreSQL database. The mounted directory stores PostgreSQL data, uploads, the
generated auth secret, and the first-admin setup token. Runtime logs are written to
`/var/opt/i-remember.fr/logs/` inside the container, which maps into the mounted
volume as `logs/startup.log`, `logs/app.log`, and `logs/postgres.log`.

Compose runs the same single-image topology, binds it to loopback port `7892`
by default, monitors PostgreSQL/API/Web readiness, and restarts it unless
explicitly stopped:

```bash
docker compose config --quiet
docker compose up -d --no-build app
```

See [Production deployment](docs/deployment.md) for immutable image selection,
TLS/reverse-proxy setup, backups, blue-green restore, monitoring, and PostgreSQL
major-version upgrades.

## Configuration

Copy `.env.example` into your deployment environment. The single-image runtime
generates its internal PostgreSQL URL, storage path, and authentication secret;
the auth and setup credentials are persisted in the data volume and included
in protected backup bundles. Common production settings are:

- `I_REMEMBER_HOST_PORT`: loopback host port, default `7892`.
- `I_REMEMBER_SETUP_TOKEN`: optional strong first-admin bootstrap credential;
  leave empty to generate and persist one, then retrieve it locally.
- `API_TRUST_PROXY`: `true` only for the supplied single-image topology, whose
  loopback web proxy sanitizes forwarding headers before the private API.
- `I_REMEMBER_TRUST_PROXY`: enable only when a trusted reverse proxy connects
  over loopback and replaces client forwarding headers.
- `I_REMEMBER_TRUSTED_PROXY_PEERS`: exact IPs or hostnames allowed to supply the
  rebuilt visitor address; Compose resolves `host.docker.internal` to its host
  gateway by default.
- `I_REMEMBER_DEFAULT_LANGUAGE`: `en`, `fr`, or `zh`.
- `I_REMEMBER_ANONYMOUS_SUBMISSIONS`: `true` or `false`.
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

PostgreSQL migration source lives in `packages/database/prisma/migrations/`.

## Release

- `package.json` is the source of truth for the app version.
- `CHANGELOG.md` records user-facing changes.
- `.github/workflows/docker.yml` publishes the one-image runtime
  `zerostwo/i-remember.fr` on pushes to `main`.
- Pushes to `main` publish `latest` and `sha-<commit>`. Pushing a `vX.Y.Z` Git
  tag publishes `X.Y.Z`, `latest`, and `sha-<commit>`.
- Production records the resolved digest and deploys that digest or its matching
  `sha-<commit>` reference; `latest` is not a rollback target.

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
