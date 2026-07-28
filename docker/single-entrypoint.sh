#!/bin/sh
set -eu

data_dir="${I_REMEMBER_DATA_DIR:-/var/opt/i-remember.fr}"
pgdata="${POSTGRES_DATA_DIR:-$data_dir/postgres}"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_major="${POSTGRES_MAJOR:-15}"
storage_path="${STORAGE_PATH:-$data_dir/assets}"
log_dir="${I_REMEMBER_LOG_DIR:-$data_dir/logs}"
app_log="$log_dir/app.log"
startup_log="$log_dir/startup.log"
postgres_log="$log_dir/postgres.log"
auth_secret_file="$data_dir/auth-secret"
pg_bin="/usr/lib/postgresql/$postgres_major/bin"
api_pid=""
web_pid=""
startup_tail_pid=""
app_tail_pid=""
postgres_tail_pid=""
postgres_started=0
stopping=0

validate_runtime_path() {
  path_value="$1"
  path_name="$2"
  case "$path_value" in
    /*) ;;
    *)
      printf '%s must be absolute.\n' "$path_name" >&2
      exit 64
      ;;
  esac
  case "$path_value" in
    *[!A-Za-z0-9_./-]*)
      printf '%s contains unsupported path characters.\n' "$path_name" >&2
      exit 64
      ;;
  esac
}

validate_runtime_path "$data_dir" I_REMEMBER_DATA_DIR
validate_runtime_path "$pgdata" POSTGRES_DATA_DIR
validate_runtime_path "$log_dir" I_REMEMBER_LOG_DIR

case "$postgres_major" in
  15) ;;
  *)
    printf 'Unsupported POSTGRES_MAJOR=%s; this image contains PostgreSQL 15 only.\n' "$postgres_major" >&2
    exit 64
    ;;
esac

case "$postgres_db" in
  ""|*[!A-Za-z0-9_]*)
    printf 'POSTGRES_DB must contain only letters, numbers, and underscores.\n' >&2
    exit 64
    ;;
esac

case "$postgres_port" in
  ""|*[!0-9]*)
    printf 'POSTGRES_PORT must be numeric.\n' >&2
    exit 64
    ;;
esac
if [ "${#postgres_port}" -gt 5 ] ||
  [ "$postgres_port" -lt 1 ] ||
  [ "$postgres_port" -gt 65535 ]; then
  printf 'POSTGRES_PORT must be between 1 and 65535.\n' >&2
  exit 64
fi

mkdir -p "$data_dir" "$pgdata" "$storage_path" "$log_dir"
chown root:postgres "$data_dir"
chmod 750 "$data_dir"
touch "$app_log" "$startup_log" "$postgres_log"
chown root:postgres "$log_dir"
chmod 750 "$log_dir"
chmod 640 "$app_log" "$startup_log" "$postgres_log"
chown postgres:postgres "$postgres_log"
chown -R postgres:postgres "$pgdata"
chmod 700 "$pgdata"

log() {
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{"ts":"%s","level":"info","component":"entrypoint","event":"%s","message":"%s"}\n' "$ts" "$1" "$2" >> "$startup_log"
}

stop() {
  if [ "$stopping" = "1" ]; then
    return
  fi
  stopping=1
  trap - INT TERM EXIT
  log "shutdown" "stopping app services"

  for pid in "$api_pid" "$web_pid" "$startup_tail_pid" "$app_tail_pid" "$postgres_tail_pid"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  if [ "$postgres_started" = "1" ]; then
    su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -m fast -w stop" >/dev/null 2>&1 || true
  fi
}

trap stop INT TERM EXIT

tail -n +1 -F "$startup_log" &
startup_tail_pid=$!
tail -n +1 -F "$app_log" &
app_tail_pid=$!
tail -n +1 -F "$postgres_log" &
postgres_tail_pid=$!

if [ ! -s "$pgdata/PG_VERSION" ]; then
  log "postgres_init" "initializing internal PostgreSQL data directory"
  su postgres -c "\"$pg_bin/initdb\" -D \"$pgdata\" --encoding=UTF8 --locale=C.UTF-8 --auth-local=trust --auth-host=trust"
elif [ "$(tr -d '[:space:]' < "$pgdata/PG_VERSION")" != "$postgres_major" ]; then
  log "postgres_version_mismatch" "persisted PGDATA is not PostgreSQL $postgres_major"
  printf 'PGDATA major version mismatch: expected %s, found %s.\n' \
    "$postgres_major" "$(tr -d '[:space:]' < "$pgdata/PG_VERSION")" >&2
  exit 65
fi

log "postgres_start" "starting internal PostgreSQL on 127.0.0.1:$postgres_port"
su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -l \"$postgres_log\" -o \"-c listen_addresses=127.0.0.1 -c jit=off -p $postgres_port\" -w start" >> "$startup_log" 2>&1
postgres_started=1

if ! "$pg_bin/psql" -h 127.0.0.1 -p "$postgres_port" -U postgres -tAc "select 1 from pg_database where datname = '$postgres_db'" | grep -q 1; then
  log "postgres_database_create" "creating database $postgres_db"
  "$pg_bin/createdb" -h 127.0.0.1 -p "$postgres_port" -U postgres "$postgres_db"
fi

if [ -n "${AUTH_SECRET:-}" ]; then
  if [ -s "$auth_secret_file" ]; then
    if [ "$(cat "$auth_secret_file")" != "$AUTH_SECRET" ]; then
      log "auth_secret_mismatch" "AUTH_SECRET does not match the persisted auth secret"
      printf 'AUTH_SECRET does not match %s; refusing an implicit credential rotation.\n' \
        "$auth_secret_file" >&2
      exit 65
    fi
  else
    umask 077
    printf '%s\n' "$AUTH_SECRET" > "$auth_secret_file"
  fi
else
  if [ ! -s "$auth_secret_file" ]; then
    umask 077
    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))" > "$auth_secret_file"
  fi
fi
chmod 600 "$auth_secret_file"
export AUTH_SECRET="$(cat "$auth_secret_file")"

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres@127.0.0.1:$postgres_port/$postgres_db?schema=public}"
export STORAGE_PATH="$storage_path"
export STORAGE_PUBLIC_BASE_URL="${STORAGE_PUBLIC_BASE_URL:-/uploads}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:7892}"
export API_HOST="${API_HOST:-127.0.0.1}"
export API_PORT="${API_PORT:-7892}"
export API_TRUST_PROXY="${API_TRUST_PROXY:-true}"
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
  if node -e "fetch('http://127.0.0.1:${API_PORT}/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
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

failed_service=""
while :; do
  if ! su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" status" >/dev/null 2>&1; then
    failed_service="postgres"
    break
  fi
  if ! "$pg_bin/pg_isready" -q -h 127.0.0.1 -p "$postgres_port" -d "$postgres_db" -U postgres; then
    failed_service="postgres-readiness"
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then
    failed_service="api"
    break
  fi
  if ! kill -0 "$web_pid" 2>/dev/null; then
    failed_service="web"
    break
  fi
  sleep 2
done

log "service_exit" "$failed_service stopped or became unhealthy"
exit 1
