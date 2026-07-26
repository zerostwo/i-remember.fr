#!/bin/sh
set -eu

postgres_major="${POSTGRES_MAJOR:-15}"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
api_port="${API_PORT:-7892}"
web_port="${PORT:-7890}"
pg_bin="/usr/lib/postgresql/$postgres_major/bin"

case "$postgres_major" in
  15) ;;
  *) exit 1 ;;
esac

"$pg_bin/pg_isready" \
  -q \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -d "$postgres_db" \
  -U postgres

node --input-type=module - "$api_port" "$web_port" <<'NODE'
const [apiPort, webPort] = process.argv.slice(2);

const checks = [
  `http://127.0.0.1:${apiPort}/readyz`,
  `http://127.0.0.1:${webPort}/readyz`,
];

for (const url of checks) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
}
NODE
