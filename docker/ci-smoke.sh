#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: docker/ci-smoke.sh IMAGE_REFERENCE" >&2
  exit 64
fi

image_ref="$1"
temp_root="${RUNNER_TEMP:-/tmp}"
temp_root="${temp_root%/}"
case "$temp_root" in
  ""|/)
    echo "Refusing unsafe CI temporary root: ${RUNNER_TEMP:-/tmp}" >&2
    exit 64
    ;;
  /*) ;;
  *)
    echo "RUNNER_TEMP must be an absolute path." >&2
    exit 64
    ;;
esac
work_dir="$(mktemp -d "$temp_root/i-remember-ci.XXXXXX")"
original_data="$work_dir/original"
restored_data="$work_dir/restored"
suffix="${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
original_name="i-remember-smoke-$suffix"
restored_name="i-remember-restored-$suffix"
restore_job_name="i-remember-restore-job-$suffix"

mkdir -p "$original_data" "$restored_data"

cleanup() {
  docker rm -f "$original_name" "$restored_name" "$restore_job_name" >/dev/null 2>&1 || true
  case "$work_dir" in
    "$temp_root"/i-remember-ci.*)
      sudo rm -rf -- "$work_dir"
      ;;
    *)
      echo "Refusing to remove unexpected CI work directory: $work_dir" >&2
      ;;
  esac
}
trap cleanup EXIT

container_port() {
  docker port "$1" 7890/tcp | awk -F: 'NR == 1 { print $NF }'
}

wait_healthy() {
  local name="$1"
  local state health
  for _ in $(seq 1 90); do
    state="$(docker inspect --format '{{.State.Status}}' "$name" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$name" 2>/dev/null || true)"
    if [[ "$state" == "running" && "$health" == "healthy" ]]; then
      return 0
    fi
    if [[ -n "$state" && "$state" != "running" ]]; then
      docker logs "$name" || true
      echo "Container $name stopped while waiting for readiness." >&2
      return 1
    fi
    sleep 2
  done
  docker logs "$name" || true
  echo "Container $name did not become healthy." >&2
  return 1
}

wait_http_healthy() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 90); do
    if curl -fsS "$url/readyz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "$name" || true
  echo "Container $name did not become HTTP-ready at $url/readyz." >&2
  return 1
}

json_value() {
  local path="$1"
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      let value = JSON.parse(input);
      for (const key of process.argv[1].split(".")) value = value?.[key];
      if (value === undefined || value === null) process.exit(2);
      process.stdout.write(String(value));
    });
  ' "$path"
}

start_app() {
  local name="$1"
  local data_path="$2"
  docker run -d \
    --name "$name" \
    -p 127.0.0.1::7890 \
    -v "$data_path:/var/opt/i-remember.fr" \
    "$image_ref" >/dev/null
  wait_healthy "$name"
}

start_app "$original_name" "$original_data"
original_port="$(container_port "$original_name")"
original_url="http://127.0.0.1:$original_port"
wait_http_healthy "$original_name" "$original_url"

status_json="$(curl -fsS "$original_url/api/v1/auth/status")"
if [[ "$(printf '%s' "$status_json" | json_value data.needsSetup)" != "true" ]]; then
  echo "Fresh volume did not request administrator setup." >&2
  exit 1
fi
curl -fsS "$original_url/version" >/dev/null

setup_json="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.invalid","password":"981211@Dd"}' \
  "$original_url/api/v1/auth/setup")"
admin_token="$(printf '%s' "$setup_json" | json_value data.token)"

memory_json="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $admin_token" \
  -d '{"title":"Persistence smoke test","content":"This memory must survive restart and restore.","visibility":"PUBLIC","status":"NORMAL"}' \
  "$original_url/api/v1/memories")"
memory_id="$(printf '%s' "$memory_json" | json_value data.id)"

curl -fsS \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $admin_token" \
  -d '{"key":"smoke/persistence.txt","contentBase64":"c21va2UtcGVyc2lzdGVuY2UK","contentType":"text/plain"}' \
  "$original_url/api/v1/assets" >/dev/null
curl -fsS "$original_url/uploads/smoke/persistence.txt" | grep -qx 'smoke-persistence'

docker exec "$original_name" sh -c \
  'test "$(cat /var/opt/i-remember.fr/postgres/PG_VERSION)" = "15"'
docker exec "$original_name" sh -c \
  'test "$(stat -c %a /var/opt/i-remember.fr/auth-secret)" = "600"'
docker exec "$original_name" \
  /usr/lib/postgresql/15/bin/psql \
  -h 127.0.0.1 \
  -U postgres \
  -d i_remember \
  -tAc 'select count(*) from "_prisma_migrations"' | grep -Eq '^[1-9][0-9]*$'
docker exec "$original_name" \
  /usr/lib/postgresql/15/bin/psql \
  -h 127.0.0.1 \
  -U postgres \
  -d i_remember \
  -tAc 'select count(*) from "menu_items"' | grep -qx '0'

backup_path="/var/opt/i-remember.fr/ci-backup.tar.gz"
docker exec "$original_name" i-remember-backup "$backup_path"

docker restart --time 30 "$original_name" >/dev/null
wait_healthy "$original_name"
original_port="$(container_port "$original_name")"
original_url="http://127.0.0.1:$original_port"
wait_http_healthy "$original_name" "$original_url"
curl -fsS -H "Authorization: Bearer $admin_token" \
  "$original_url/api/v1/auth/account" >/dev/null
curl -fsS "$original_url/api/v1/memories/$memory_id" >/dev/null
curl -fsS "$original_url/uploads/smoke/persistence.txt" | grep -qx 'smoke-persistence'

docker stop --time 30 "$original_name" >/dev/null
docker rm "$original_name" >/dev/null

docker run --rm \
  --name "$restore_job_name" \
  --entrypoint /usr/local/bin/i-remember-restore \
  -v "$restored_data:/var/opt/i-remember.fr" \
  -v "$original_data/ci-backup.tar.gz:/restore/backup.tar.gz:ro" \
  "$image_ref" \
  /restore/backup.tar.gz

start_app "$restored_name" "$restored_data"
restored_port="$(container_port "$restored_name")"
restored_url="http://127.0.0.1:$restored_port"
wait_http_healthy "$restored_name" "$restored_url"

curl -fsS -H "Authorization: Bearer $admin_token" \
  "$restored_url/api/v1/auth/account" >/dev/null
curl -fsS "$restored_url/api/v1/memories/$memory_id" >/dev/null
curl -fsS "$restored_url/uploads/smoke/persistence.txt" | grep -qx 'smoke-persistence'
docker exec "$restored_name" /usr/local/bin/i-remember-healthcheck

echo "Fresh-volume, readiness, restart, backup, and restore checks passed."
