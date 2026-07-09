#!/bin/sh
set -eu

data_dir="${I_REMEMBER_DATA_DIR:-/var/opt/i-remember.fr}"
pgdata="${POSTGRES_DATA_DIR:-$data_dir/postgres}"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
storage_path="${STORAGE_PATH:-$data_dir/assets}"
auth_secret_file="$data_dir/auth-secret"
pg_bin="$(dirname "$(find /usr/lib/postgresql -type f -name pg_ctl | sort -V | tail -n 1)")"

mkdir -p "$data_dir" "$pgdata" "$storage_path"
chmod 755 "$data_dir"
chown -R postgres:postgres "$pgdata"
chmod 700 "$pgdata"

if [ ! -s "$pgdata/PG_VERSION" ]; then
  su postgres -c "\"$pg_bin/initdb\" -D \"$pgdata\" --encoding=UTF8 --locale=C.UTF-8 --auth-local=trust --auth-host=trust"
fi

su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -l \"$pgdata/postgres.log\" -o \"-c listen_addresses=127.0.0.1 -p $postgres_port\" -w start"

if ! "$pg_bin/psql" -h 127.0.0.1 -p "$postgres_port" -U postgres -tAc "select 1 from pg_database where datname = '$postgres_db'" | grep -q 1; then
  "$pg_bin/createdb" -h 127.0.0.1 -p "$postgres_port" -U postgres "$postgres_db"
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  if [ ! -s "$auth_secret_file" ]; then
    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))" > "$auth_secret_file"
    chmod 600 "$auth_secret_file"
  fi
  export AUTH_SECRET="$(cat "$auth_secret_file")"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:$postgres_port/$postgres_db?schema=public}"
export STORAGE_PATH="$storage_path"
export STORAGE_PUBLIC_BASE_URL="${STORAGE_PUBLIC_BASE_URL:-/uploads}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:7892}"
export API_HOST="${API_HOST:-127.0.0.1}"
export API_PORT="${API_PORT:-7892}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-7890}"

cd /app/packages/database
../../node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

cd /app
node apps/api/dist/server.js &
api_pid=$!
api_ready=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if node -e "fetch('http://127.0.0.1:${API_PORT}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    api_ready=1
    break
  fi
  sleep 1
done

if [ "$api_ready" != "1" ]; then
  echo "API did not become ready" >&2
  exit 1
fi

node server.mjs &
web_pid=$!

stop() {
  kill "$api_pid" "$web_pid" 2>/dev/null || true
  su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -m fast -w stop" >/dev/null 2>&1 || true
}
trap stop INT TERM EXIT

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 2
done

exit 1
