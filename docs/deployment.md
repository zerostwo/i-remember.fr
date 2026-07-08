# Deployment

Production deployment remains an app-only Docker image.

## Build

```bash
npm run build
docker compose build app
```

The published image name is controlled by environment:

- `DOCKERHUB_IMAGE`
- `TAG`

## Runtime

`docker-compose.yml` exposes only the `app` service. The container serves the
public site, admin prototype, and API through `server.mjs`.

Important environment variables:

- `DATABASE_URL`: reserved for future external database adapters.
- `AUTH_SECRET`: reserved for future stateless auth sessions.
- `I_REMEMBER_DATA_DIR`: SQLite database and upload storage directory.
- `I_REMEMBER_DEFAULT_LANGUAGE`: default UI language.
- `I_REMEMBER_ANONYMOUS_SUBMISSIONS`: controls anonymous memory posting.
- `UMAMI_SRC` and `UMAMI_WEBSITE_ID`: optional self-hosted Umami tracking.

The current Docker volume stores SQLite and uploaded files at
`/var/opt/i-remember.fr`.
