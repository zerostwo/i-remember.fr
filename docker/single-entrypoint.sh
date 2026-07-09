#!/bin/sh
set -eu

data_dir="${I_REMEMBER_DATA_DIR:-/var/opt/i-remember.fr}"
pgdata="${POSTGRES_DATA_DIR:-$data_dir/postgres}"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
storage_path="${STORAGE_PATH:-$data_dir/assets}"
log_dir="${I_REMEMBER_LOG_DIR:-$data_dir/logs}"
app_log="$log_dir/app.log"
startup_log="$log_dir/startup.log"
postgres_log="$log_dir/postgres.log"
auth_secret_file="$data_dir/auth-secret"
pg_bin="$(dirname "$(find /usr/lib/postgresql -type f -name pg_ctl | sort -V | tail -n 1)")"

mkdir -p "$data_dir" "$pgdata" "$storage_path" "$log_dir"
chmod 755 "$data_dir"
touch "$app_log" "$startup_log" "$postgres_log"
chmod 755 "$log_dir"
chown postgres:postgres "$postgres_log"
chown -R postgres:postgres "$pgdata"
chmod 700 "$pgdata"

log() {
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{"ts":"%s","level":"info","component":"entrypoint","event":"%s","message":"%s"}\n' "$ts" "$1" "$2" >> "$startup_log"
}

tail -n +1 -F "$startup_log" &
startup_tail_pid=$!
tail -n +1 -F "$app_log" &
app_tail_pid=$!
tail -n +1 -F "$postgres_log" &
postgres_tail_pid=$!

if [ ! -s "$pgdata/PG_VERSION" ]; then
  log "postgres_init" "initializing internal PostgreSQL data directory"
  su postgres -c "\"$pg_bin/initdb\" -D \"$pgdata\" --encoding=UTF8 --locale=C.UTF-8 --auth-local=trust --auth-host=trust"
fi

log "postgres_start" "starting internal PostgreSQL on 127.0.0.1:$postgres_port"
su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -l \"$postgres_log\" -o \"-c listen_addresses=127.0.0.1 -c jit=off -p $postgres_port\" -w start" >> "$startup_log" 2>&1

if ! "$pg_bin/psql" -h 127.0.0.1 -p "$postgres_port" -U postgres -tAc "select 1 from pg_database where datname = '$postgres_db'" | grep -q 1; then
  log "postgres_database_create" "creating database $postgres_db"
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
log "database_migrate" "applying Prisma migrations"
./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma >> "$startup_log" 2>&1

cd /app
log "api_start" "starting API server on 127.0.0.1:$API_PORT"
node apps/api/dist/server.js >> "$app_log" 2>&1 &
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
  log "api_ready_failed" "API did not become ready"
  exit 1
fi

log "web_start" "starting web server on 0.0.0.0:$PORT"
node server.mjs >> "$app_log" 2>&1 &
web_pid=$!

stop() {
  log "shutdown" "stopping app services"
  kill "$api_pid" "$web_pid" "$startup_tail_pid" "$app_tail_pid" "$postgres_tail_pid" 2>/dev/null || true
  su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -m fast -w stop" >/dev/null 2>&1 || true
}
trap stop INT TERM EXIT

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 2
done

exit 1
