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
`web` and `admin` share the same archive compatibility data volume while the
public archive still reads legacy SQLite data; production API state lives in
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

The legacy public archive compatibility layer still needs
`I_REMEMBER_DATA_DIR` until the public frontend fully reads from the new API.
