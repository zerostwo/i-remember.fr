# Production deployment

The supported self-hosted production shape is one application image plus one
persistent data volume. The image runs the public web server, the private API,
and an embedded PostgreSQL 15 server. The volume stores PostgreSQL data,
uploaded assets, the authentication secret, the first-admin setup token, and
runtime logs.

## Release reference

GitHub publishes three references for a release commit:

- `sha-<12-character-commit>` for every `main` build;
- `X.Y.Z` for a matching `vX.Y.Z` Git tag;
- the mutable convenience tag `latest`.

Production must record the image digest and deploy either that digest directly
or the matching `sha-*` tag after verifying its digest. Do not use `latest` as a
rollback reference.

```bash
docker buildx imagetools inspect \
  zerostwo/i-remember.fr:sha-eeb33b14cd1e
```

For a digest-pinned `docker run`, the image reference has this shape:

```text
zerostwo/i-remember.fr@sha256:<verified-manifest-digest>
```

## Compose deployment

Create a deployment `.env` from `.env.example`, then set at least:

```dotenv
DOCKERHUB_IMAGE=zerostwo/i-remember.fr
# Replace with the published tag for the exact commit.
TAG=sha-0123456789ab
I_REMEMBER_HOST_PORT=7892
I_REMEMBER_DEFAULT_LANGUAGE=en
I_REMEMBER_ANONYMOUS_SUBMISSIONS=false
```

Leave `AUTH_SECRET` empty on a new deployment. The entrypoint generates a
random secret and persists it as `/var/opt/i-remember.fr/auth-secret`. If an
operator supplies `AUTH_SECRET`, the entrypoint persists it and later refuses
to start if the environment value differs from the persisted value. This
prevents accidental token and two-factor-encryption key rotation.

Validate and start the selected image:

```bash
docker compose config --quiet
docker compose pull app
docker compose up -d --no-build app
docker compose ps
```

Compose publishes only `127.0.0.1:${I_REMEMBER_HOST_PORT:-7892}` and uses
`restart: unless-stopped`. Its health check requires PostgreSQL, the private API,
and the public web process to be ready.

Verify locally before enabling public traffic:

```bash
curl --fail --show-error http://127.0.0.1:7892/readyz
curl --fail --show-error http://127.0.0.1:7892/version
docker compose exec -T app /usr/local/bin/i-remember-healthcheck
```

Create the first administrator at `/admin/setup` before opening the public
route, then enable two-factor authentication. Setup requires a password of at
least eight characters, is rate limited, and is disabled by the database once
the first user exists.

## Domain, reverse proxy, and TLS

The application port must remain loopback-only. Put a managed reverse proxy or
Cloudflare Tunnel in front of `http://127.0.0.1:7892` and configure:

- the intended apex and/or `www` DNS records;
- valid TLS with HTTP-to-HTTPS redirect;
- HSTS after HTTPS has been verified;
- request-body and request-time limits;
- trusted proxy IP handling at exactly one boundary;
- rate limits for login, setup, uploads, and anonymous writes.

The single-image topology sets `API_TRUST_PROXY=true` because the API listens
on loopback and receives API traffic only from the built-in web proxy. That web
proxy must discard client-supplied forwarding headers and set
`X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` from its trusted
connection context. Do not set `API_TRUST_PROXY=true` if you expose the API
directly or place it behind a proxy that preserves untrusted client
`X-Forwarded-*` values.

When a TLS reverse proxy or tunnel connects to the built-in web listener over
loopback, set `I_REMEMBER_TRUST_PROXY=true` only if that proxy replaces
client-supplied `X-Forwarded-For` with its verified visitor address. Compose
maps `host.docker.internal` to the host gateway and supplies it through
`I_REMEMBER_TRUSTED_PROXY_PEERS`; custom topologies must list their exact
trusted IPs or resolvable peer names instead. The web layer accepts the first
syntactically valid IP only from loopback or that allowlist, discards the rest
of the forwarding chain, and rebuilds the headers passed to the private API.
Keep trust disabled for direct access or any proxy that appends to untrusted
client headers. The trusted edge should still enforce coarse abuse limits.

Before launch, verify the public hostname returns this application's `/version`
and `/readyz`, not a parked domain or another service. Keep the origin port
closed to the LAN/WAN unless direct access is an explicit requirement.

## Backups

The built-in backup command creates a sensitive, checksum-protected bundle
containing:

- a custom-format `pg_dump`;
- uploaded assets;
- the persisted `auth-secret`;
- a JSON manifest and SHA-256 checksums.

Pause or block public/admin writes while the command runs so database and asset
state do not change between the logical dump and filesystem archive.

```bash
mkdir -p backups
chmod 700 backups

container_id="$(docker compose ps -q app)"
backup_name="i-remember-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
container_backup="/var/opt/i-remember.fr/.backup-export/$backup_name"

docker exec "$container_id" \
  i-remember-backup "$container_backup"
docker cp \
  "$container_id:$container_backup" \
  "./backups/$backup_name"
docker exec "$container_id" rm -f "$container_backup"
chmod 600 "./backups/$backup_name"
```

Copy the bundle off the Docker host and apply encrypted retention appropriate
for authentication material and user content. Do not treat the admin JSON
export or a live copy of the PostgreSQL data directory as a database backup.

## Blue-green restore

Restore only into a new, empty volume. The restore command intentionally refuses
a non-empty target; it never overwrites the active production volume.

```bash
image_ref="zerostwo/i-remember.fr@sha256:<verified-manifest-digest>"
backup_path="$PWD/backups/i-remember-YYYYmmddTHHMMSSZ.tar.gz"

docker volume create i-remember-restore
docker run --rm \
  --entrypoint /usr/local/bin/i-remember-restore \
  -v i-remember-restore:/var/opt/i-remember.fr \
  -v "$backup_path:/restore/backup.tar.gz:ro" \
  "$image_ref" \
  /restore/backup.tar.gz
```

Start a candidate on a different loopback port and test it before switching the
reverse proxy:

```bash
docker run -d \
  --name i-remember-restore-verify \
  -p 127.0.0.1:7894:7890 \
  -v i-remember-restore:/var/opt/i-remember.fr \
  "$image_ref"

curl --fail --show-error http://127.0.0.1:7894/readyz
curl --fail --show-error http://127.0.0.1:7894/version
```

Also verify administrator login and 2FA, representative memory URLs, search,
and uploaded images. Only then switch traffic. Keep the prior volume and image
digest unchanged until the rollback window closes.

## PostgreSQL upgrades

The image is pinned to PostgreSQL 15 and refuses to start a data directory with
a different major version. Do not replace the physical `postgres/` directory
across major versions. Upgrade through a verified logical backup and blue-green
restore using an image designed for the target PostgreSQL major.

Prisma migrations run at container startup. Take a verified backup before every
release containing schema changes, and keep migrations backward-compatible
during the rollback window.

## Monitoring and logs

Alert on:

- Docker health becoming `unhealthy` or repeated container restarts;
- `/version` differing from the recorded release;
- backup age and restore-drill failures;
- volume free space and growth of `postgres/`, `assets/`, and `logs/`;
- PostgreSQL recovery, migration errors, HTTP 5xx/429, and failed logins;
- TLS certificate expiry and tunnel/origin reachability.

Docker JSON logs rotate at 10 MiB with five files under Compose. The persistent
files below still need host-level rotation and retention:

- `logs/startup.log`;
- `logs/app.log`;
- `logs/postgres.log`.
