# Deployment

Production deployment follows the refactor document's multi-service shape:

- `web`: public archive experience.
- `admin`: admin experience served separately.
- `api`: TypeScript REST API.
- `postgres`: PostgreSQL database for Prisma.

## Build

```bash
pnpm install
pnpm build
docker compose build
```

The published image names use:

- `DOCKERHUB_IMAGE`
- `TAG`

Compose appends `-web`, `-admin`, and `-api` to the configured image base.
`web` and `admin` can share the archive runtime data volume during migration;
the admin service runs in admin-only mode, and production API state lives in
PostgreSQL.

The GitHub workflow builds and pushes those same compose images instead of a
single root image.

## Runtime Environment

Required production variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `STORAGE_PATH`

Common operational variables:

- `API_BASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `I_REMEMBER_DEFAULT_LANGUAGE`
- `I_REMEMBER_ANONYMOUS_SUBMISSIONS`
- `UMAMI_SRC`
- `UMAMI_WEBSITE_ID`

`I_REMEMBER_DATA_DIR` points at the archive runtime data directory until the
public frontend fully reads from the new API.
