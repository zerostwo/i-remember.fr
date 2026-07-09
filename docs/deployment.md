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
generated auth secret. It also stores runtime logs:

- `logs/startup.log`: entrypoint, migration, and service startup events.
- `logs/app.log`: web, API, proxy, and admin request logs.
- `logs/postgres.log`: internal PostgreSQL logs.

## Build

```bash
pnpm install
pnpm build
docker build -t "${DOCKERHUB_IMAGE:-zerostwo/i-remember.fr}:${TAG:-latest}" .
```

The published image name uses:

- `DOCKERHUB_IMAGE`
- `TAG`

GitHub publishes only the single image named by `DOCKERHUB_IMAGE`.

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
