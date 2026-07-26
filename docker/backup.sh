#!/bin/sh
set -eu

usage() {
  printf 'Usage: i-remember-backup /absolute/path/to/backup.tar.gz\n' >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 64
fi

output_path="$1"
case "$output_path" in
  /*) ;;
  *)
    printf 'Backup output path must be absolute.\n' >&2
    exit 64
    ;;
esac

if [ -e "$output_path" ]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$output_path" >&2
  exit 73
fi

data_dir="${I_REMEMBER_DATA_DIR:-/var/opt/i-remember.fr}"
storage_path="${STORAGE_PATH:-$data_dir/assets}"
auth_secret_file="$data_dir/auth-secret"
setup_token_file="$data_dir/setup-token"
postgres_db="${POSTGRES_DB:-i_remember}"
postgres_port="${POSTGRES_PORT:-5432}"
postgres_major="${POSTGRES_MAJOR:-15}"
pg_bin="/usr/lib/postgresql/$postgres_major/bin"

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

if [ ! -s "$auth_secret_file" ]; then
  printf 'Missing persisted auth secret: %s\n' "$auth_secret_file" >&2
  exit 66
fi

if [ ! -s "$setup_token_file" ]; then
  printf 'Missing persisted setup token: %s\n' "$setup_token_file" >&2
  exit 66
fi

if [ ! -d "$storage_path" ]; then
  printf 'Missing asset directory: %s\n' "$storage_path" >&2
  exit 66
fi

if ! "$pg_bin/pg_isready" \
  -q \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -d "$postgres_db" \
  -U postgres; then
  printf 'PostgreSQL is not ready; backup aborted.\n' >&2
  exit 69
fi

output_dir="$(dirname "$output_path")"
mkdir -p "$output_dir"
stage_dir="$(mktemp -d "$output_dir/.i-remember-backup.XXXXXX")"
partial_path="$stage_dir/backup.tar.gz"

cleanup() {
  rm -f "$partial_path"
  rm -rf "$stage_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

umask 077
created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
app_name="$(node -p "JSON.parse(require('node:fs').readFileSync('/app/package.json', 'utf8')).name")"
app_version="$(node -p "JSON.parse(require('node:fs').readFileSync('/app/package.json', 'utf8')).version")"
server_version="$("$pg_bin/psql" \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -U postgres \
  -d "$postgres_db" \
  -Atc "show server_version")"
server_major="${server_version%%.*}"

if [ "$server_major" != "$postgres_major" ]; then
  printf 'Running PostgreSQL major %s does not match expected major %s.\n' \
    "$server_major" "$postgres_major" >&2
  exit 65
fi

printf 'Creating PostgreSQL logical dump...\n' >&2
"$pg_bin/pg_dump" \
  -h 127.0.0.1 \
  -p "$postgres_port" \
  -U postgres \
  -d "$postgres_db" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  --file="$stage_dir/database.dump"

printf 'Archiving uploaded assets...\n' >&2
tar -C "$storage_path" -czf "$stage_dir/assets.tar.gz" .
cp "$auth_secret_file" "$stage_dir/auth-secret"
chmod 600 "$stage_dir/auth-secret"
cp "$setup_token_file" "$stage_dir/setup-token"
chmod 600 "$stage_dir/setup-token"

(
  cd "$stage_dir"
  sha256sum database.dump assets.tar.gz auth-secret setup-token > SHA256SUMS
)

BACKUP_CREATED_AT="$created_at" \
APP_NAME="$app_name" \
APP_VERSION="$app_version" \
POSTGRES_DB_NAME="$postgres_db" \
POSTGRES_SERVER_VERSION="$server_version" \
POSTGRES_SERVER_MAJOR="$server_major" \
node --input-type=module - "$stage_dir/SHA256SUMS" > "$stage_dir/manifest.json" <<'NODE'
import { readFileSync } from "node:fs";

const checksumFile = process.argv[2];
const files = Object.fromEntries(
  readFileSync(checksumFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha256, name] = line.trim().split(/\s+/, 2);
      return [name, { sha256 }];
    }),
);

process.stdout.write(
  `${JSON.stringify(
    {
      format: "i-remember-backup",
      formatVersion: 1,
      createdAt: process.env.BACKUP_CREATED_AT,
      app: {
        name: process.env.APP_NAME,
        version: process.env.APP_VERSION,
      },
      database: {
        engine: "postgresql",
        name: process.env.POSTGRES_DB_NAME,
        serverVersion: process.env.POSTGRES_SERVER_VERSION,
        major: Number(process.env.POSTGRES_SERVER_MAJOR),
        dumpFormat: "custom",
      },
      files,
    },
    null,
    2,
  )}\n`,
);
NODE

tar -C "$stage_dir" \
  -czf "$partial_path" \
  manifest.json \
  SHA256SUMS \
  database.dump \
  assets.tar.gz \
  auth-secret \
  setup-token
chmod 600 "$partial_path"
ln "$partial_path" "$output_path"

printf 'Backup created: %s\n' "$output_path" >&2
