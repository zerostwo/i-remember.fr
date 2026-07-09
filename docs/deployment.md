# Deployment

The simplest deployment is one image plus one persistent volume:

```bash
docker run -d \
  --name i-remember.fr \
  -p 7892:7890 \
  -v ~/.i-remember.fr:/var/opt/i-remember.fr \
  zerostwo/i-remember.fr:latest
```

Open `http://localhost:7892`.

That image starts the public web server, API server, and an internal PostgreSQL
database. The mounted directory stores PostgreSQL data, uploads, and the
generated auth secret.

The PostgreSQL deployment follows the refactor document's multi-service shape:

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

The published image name uses:

- `DOCKERHUB_IMAGE`
- `TAG`

The single-image runtime uses `DOCKERHUB_IMAGE` directly. The compose file
still supports local multi-service builds, but GitHub publishes only
`zerostwo/i-remember.fr`.

Pushes to `main` publish `latest` and `sha-<commit>`. Pushing a `vX.Y.Z` Git tag
publishes `X.Y.Z`, `latest`, and `sha-<commit>`.

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
