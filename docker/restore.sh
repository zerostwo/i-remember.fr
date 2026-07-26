#!/bin/sh
set -eu

usage() {
  printf 'Usage: i-remember-restore /absolute/path/to/backup.tar.gz\n' >&2
  printf 'Restore is allowed only into an empty I_REMEMBER_DATA_DIR.\n' >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 64
fi

bundle_path="$1"
case "$bundle_path" in
  /*) ;;
  *)
    printf 'Backup bundle path must be absolute.\n' >&2
    exit 64
    ;;
esac

if [ ! -f "$bundle_path" ]; then
  printf 'Backup bundle not found: %s\n' "$bundle_path" >&2
  exit 66
fi

data_dir="${I_REMEMBER_DATA_DIR:-/var/opt/i-remember.fr}"
pgdata="${POSTGRES_DATA_DIR:-$data_dir/postgres}"
storage_path="${STORAGE_PATH:-$data_dir/assets}"
auth_secret_file="$data_dir/auth-secret"
setup_token_file="$data_dir/setup-token"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_major="${POSTGRES_MAJOR:-15}"
pg_bin="/usr/lib/postgresql/$postgres_major/bin"

case "$data_dir" in
  /*) ;;
  *)
    printf 'I_REMEMBER_DATA_DIR must be absolute.\n' >&2
    exit 64
    ;;
esac

case "$data_dir" in
  /|/var|/var/opt|/tmp|/app)
    printf 'Refusing unsafe restore target: %s\n' "$data_dir" >&2
    exit 64
    ;;
esac

if [ "$pgdata" != "$data_dir/postgres" ] || [ "$storage_path" != "$data_dir/assets" ]; then
  printf 'Restore requires POSTGRES_DATA_DIR and STORAGE_PATH below I_REMEMBER_DATA_DIR.\n' >&2
  printf 'Expected %s/postgres and %s/assets.\n' "$data_dir" "$data_dir" >&2
  exit 64
fi

case "$postgres_major" in
  15) ;;
  *)
    printf 'Unsupported POSTGRES_MAJOR=%s; expected 15.\n' "$postgres_major" >&2
    exit 65
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

case "$data_dir" in
  *[!A-Za-z0-9_./-]*)
    printf 'I_REMEMBER_DATA_DIR contains unsupported path characters.\n' >&2
    exit 64
    ;;
esac

if [ -d "$data_dir" ] && [ -n "$(ls -A "$data_dir" 2>/dev/null)" ]; then
  printf 'Refusing to restore into non-empty target: %s\n' "$data_dir" >&2
  printf 'Create a new volume/directory and restore there instead.\n' >&2
  exit 73
fi

mkdir -p "$data_dir"
stage_dir="$(mktemp -d "$data_dir/.i-remember-restore.XXXXXX")"
postgres_started=0

cleanup() {
  if [ "$postgres_started" = "1" ]; then
    su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -m fast -w stop" >/dev/null 2>&1 || true
  fi
  rm -rf "$stage_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

expected_entries="$(printf '%s\n' SHA256SUMS assets.tar.gz auth-secret database.dump manifest.json setup-token | sort)"
actual_entries="$(tar -tzf "$bundle_path" | sed 's#^\./##' | sort)"
if [ "$actual_entries" != "$expected_entries" ]; then
  printf 'Backup bundle contains an unexpected file set.\n' >&2
  exit 65
fi

tar --no-same-owner --no-same-permissions -xzf "$bundle_path" -C "$stage_dir"
(
  cd "$stage_dir"
  sha256sum -c SHA256SUMS
)

EXPECTED_POSTGRES_DB="$postgres_db" \
EXPECTED_POSTGRES_MAJOR="$postgres_major" \
node --input-type=module - "$stage_dir/manifest.json" <<'NODE'
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (manifest.format !== "i-remember-backup" || manifest.formatVersion !== 1) {
  throw new Error("Unsupported backup manifest");
}
if (manifest.database?.engine !== "postgresql") {
  throw new Error("Backup is not a PostgreSQL bundle");
}
if (String(manifest.database?.name || "") !== process.env.EXPECTED_POSTGRES_DB) {
  throw new Error("POSTGRES_DB does not match the backup manifest");
}
if (Number(manifest.database?.major) !== Number(process.env.EXPECTED_POSTGRES_MAJOR)) {
  throw new Error("PostgreSQL major does not match the backup manifest");
}
NODE

if tar -tzf "$stage_dir/assets.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  printf 'Asset archive contains an unsafe path.\n' >&2
  exit 65
fi
unsafe_asset_type="$(
  tar -tvzf "$stage_dir/assets.tar.gz" |
    awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { print $1; exit }'
)"
if [ -n "$unsafe_asset_type" ]; then
  printf 'Asset archive contains a non-file entry type: %s\n' "$unsafe_asset_type" >&2
  exit 65
fi

umask 077
mkdir -p "$data_dir" "$pgdata" "$storage_path" "$data_dir/logs"
chown root:postgres "$data_dir"
chmod 750 "$data_dir" "$data_dir/logs"
touch "$data_dir/logs/restore-postgres.log"
chown postgres:postgres "$data_dir/logs" "$data_dir/logs/restore-postgres.log"
chmod 750 "$data_dir/logs"
chmod 640 "$data_dir/logs/restore-postgres.log"
chown -R postgres:postgres "$pgdata"
chmod 700 "$pgdata"

printf 'Initializing PostgreSQL %s in %s...\n' "$postgres_major" "$pgdata" >&2
su postgres -c "\"$pg_bin/initdb\" -D \"$pgdata\" --encoding=UTF8 --locale=C.UTF-8 --auth-local=trust --auth-host=trust"
su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -l \"$data_dir/logs/restore-postgres.log\" -o \"-c listen_addresses=127.0.0.1 -c jit=off -p $postgres_port\" -w start"
postgres_started=1

"$pg_bin/createdb" \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -U postgres \
  "$postgres_db"

printf 'Restoring PostgreSQL logical dump...\n' >&2
"$pg_bin/pg_restore" \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -U postgres \
  -d "$postgres_db" \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "$stage_dir/database.dump"

printf 'Restoring assets and authentication secret...\n' >&2
tar --no-same-owner --no-same-permissions -xzf "$stage_dir/assets.tar.gz" -C "$storage_path"
cp "$stage_dir/auth-secret" "$auth_secret_file"
chmod 600 "$auth_secret_file"
cp "$stage_dir/setup-token" "$setup_token_file"
chmod 600 "$setup_token_file"
cp "$stage_dir/manifest.json" "$data_dir/restore-manifest.json"
chmod 600 "$data_dir/restore-manifest.json"

su postgres -c "\"$pg_bin/pg_ctl\" -D \"$pgdata\" -m fast -w stop"
postgres_started=0

printf 'Restore completed in %s. Start a new container against this target to verify it.\n' \
  "$data_dir" >&2
