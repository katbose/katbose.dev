#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
readonly REPO_ROOT
readonly CONTRACT_SCRIPT="$SCRIPT_DIR/backup-set.mjs"
readonly RETAIN_COMPLETE_SETS="${RETAIN_COMPLETE_SETS:-4}"
# `production` binds every target to the hosted Supabase project named by
# SUPABASE_PROJECT_REF. `local-drill` instead requires every target -- database,
# Storage and object store -- to be loopback, so a drill can neither read a
# hosted project nor let retention delete a real backup set. Production never
# sets this, so its behaviour is unchanged. See docs/10-backups-and-portability.md §10.7.
readonly BACKUP_TARGET_PROFILE="${BACKUP_TARGET_PROFILE:-production}"
readonly PG_DUMP_BIN="${PG_DUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump}"
readonly PG_RESTORE_BIN="${PG_RESTORE_BIN:-/usr/lib/postgresql/17/bin/pg_restore}"
readonly PSQL_BIN="${PSQL_BIN:-/usr/lib/postgresql/17/bin/psql}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: $name" >&2
    exit 1
  fi
}

for name in \
  SUPABASE_DB_URL \
  SUPABASE_PROJECT_REF \
  SUPABASE_STORAGE_RCLONE_CONFIG \
  R2_RCLONE_CONFIG \
  BACKUP_AGE_RECIPIENT \
  GITHUB_SHA \
  GITHUB_RUN_ID \
  GITHUB_RUN_ATTEMPT \
  RUNNER_TEMP; do
  require_env "$name"
done

for command in age jq node rclone sha256sum tar zstd; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required backup tool is unavailable: $command" >&2
    exit 1
  }
done

[[ -x "$PG_DUMP_BIN" ]] || {
  echo "PostgreSQL 17 pg_dump is unavailable: $PG_DUMP_BIN" >&2
  exit 1
}
[[ -x "$PG_RESTORE_BIN" ]] || {
  echo "PostgreSQL 17 pg_restore is unavailable: $PG_RESTORE_BIN" >&2
  exit 1
}
[[ -x "$PSQL_BIN" ]] || {
  echo "PostgreSQL 17 psql is unavailable: $PSQL_BIN" >&2
  exit 1
}
[[ "$($PG_DUMP_BIN --version | grep -oE '[0-9]+' | head -n 1)" == "17" ]]
[[ "$($PG_RESTORE_BIN --version | grep -oE '[0-9]+' | head -n 1)" == "17" ]]
[[ "$($PSQL_BIN --version | grep -oE '[0-9]+' | head -n 1)" == "17" ]]

if [[ "$BACKUP_TARGET_PROFILE" != "production" && "$BACKUP_TARGET_PROFILE" != "local-drill" ]]; then
  echo "BACKUP_TARGET_PROFILE must be production or local-drill" >&2
  exit 1
fi
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Invalid Supabase project reference" >&2
  exit 1
fi
if ! BACKUP_TARGET_PROFILE="$BACKUP_TARGET_PROFILE" \
  node --input-type=module - "$SUPABASE_PROJECT_REF" <<'NODE'
const expectedRef = process.argv[2];
const profile = process.env.BACKUP_TARGET_PROFILE;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
try {
  const databaseUrl = new URL(process.env.SUPABASE_DB_URL);
  const username = decodeURIComponent(databaseUrl.username);
  if (profile === "local-drill") {
    if (!LOOPBACK_HOSTS.has(databaseUrl.hostname)) {
      throw new Error("drill database is not loopback");
    }
  } else {
    const directHost = databaseUrl.hostname === `db.${expectedRef}.supabase.co`;
    const poolerUser = username === `postgres.${expectedRef}`;
    if (!directHost && !poolerUser) throw new Error("project mismatch");
  }
} catch {
  process.stderr.write(
    profile === "local-drill"
      ? "SUPABASE_DB_URL must be a loopback database under BACKUP_TARGET_PROFILE=local-drill\n"
      : "SUPABASE_DB_URL does not match SUPABASE_PROJECT_REF\n",
  );
  process.exit(1);
}
NODE
then
  exit 1
fi

if [[ "$BACKUP_TARGET_PROFILE" == "local-drill" ]]; then
  storage_endpoint_pattern="^[[:space:]]*endpoint[[:space:]]*=[[:space:]]*http://(127\\.0\\.0\\.1|localhost):[0-9]{1,5}/storage/v1/s3[[:space:]]*$"
  storage_endpoint_expectation="a loopback Storage endpoint"
else
  storage_endpoint_pattern="^[[:space:]]*endpoint[[:space:]]*=[[:space:]]*https://${SUPABASE_PROJECT_REF}\\.storage\\.supabase\\.co/storage/v1/s3[[:space:]]*$"
  storage_endpoint_expectation="SUPABASE_PROJECT_REF"
fi
if ! printf '%s' "$SUPABASE_STORAGE_RCLONE_CONFIG" \
  | tr -d '\r' \
  | grep --extended-regexp --quiet "$storage_endpoint_pattern"; then
  echo "SUPABASE_STORAGE_RCLONE_CONFIG does not match $storage_endpoint_expectation" >&2
  exit 1
fi

# Retention deletes older sets, so a drill must be unable to address real R2.
if [[ "$BACKUP_TARGET_PROFILE" == "local-drill" ]]; then
  if ! printf '%s' "$R2_RCLONE_CONFIG" \
    | tr -d '\r' \
    | grep --extended-regexp --quiet \
      "^[[:space:]]*endpoint[[:space:]]*=[[:space:]]*http://(127\\.0\\.0\\.1|localhost):[0-9]{1,5}/?[[:space:]]*$"; then
    echo "R2_RCLONE_CONFIG must use a loopback endpoint under BACKUP_TARGET_PROFILE=local-drill" >&2
    exit 1
  fi
fi

export PGDATABASE="$SUPABASE_DB_URL"
unset SUPABASE_DB_URL

CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
readonly CREATED_AT
SET_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly SET_TIMESTAMP
readonly SET_ID="weekly-${SET_TIMESTAMP}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
WORK_DIR="$(mktemp -d "$RUNNER_TEMP/katbose-weekly-backup.XXXXXX")"
readonly WORK_DIR
readonly SET_DIR="$WORK_DIR/set"
readonly ARTIFACT_DIR="$RUNNER_TEMP/weekly-backup-artifacts"
readonly PLAINTEXT_ARCHIVE="$WORK_DIR/${SET_ID}.tar.zst"
readonly ENCRYPTED_ARCHIVE="$ARTIFACT_DIR/${SET_ID}.tar.zst.age"
readonly COMPLETE_MARKER="$ARTIFACT_DIR/complete.json"
readonly SUPABASE_RCLONE_CONFIG="$WORK_DIR/supabase-rclone.conf"
readonly R2_CONFIG="$WORK_DIR/r2-rclone.conf"
readonly R2_WEEKLY_ROOT="r2:katbose-backups/weekly"
readonly R2_SET_ROOT="$R2_WEEKLY_ROOT/$SET_ID"
readonly R2_ARCHIVE="$R2_SET_ROOT/${SET_ID}.tar.zst.age"
readonly R2_MARKER="$R2_SET_ROOT/complete.json"

remote_upload_started=false
remote_set_complete=false

cleanup() {
  local exit_code=$?
  trap - EXIT

  if [[ "$exit_code" -ne 0 && "$remote_upload_started" == "true" && "$remote_set_complete" != "true" ]]; then
    echo "Removing incomplete remote backup set $SET_ID" >&2
    rclone --config "$R2_CONFIG" --s3-no-check-bucket purge "$R2_SET_ROOT" >/dev/null 2>&1 || true
  fi

  rm -rf -- "$WORK_DIR" "$PLAINTEXT_ARCHIVE"
  exit "$exit_code"
}
trap cleanup EXIT

mkdir -p "$SET_DIR/storage" "$ARTIFACT_DIR"
printf '%s' "$SUPABASE_STORAGE_RCLONE_CONFIG" > "$SUPABASE_RCLONE_CONFIG"
printf '%s' "$R2_RCLONE_CONFIG" > "$R2_CONFIG"
chmod 600 "$SUPABASE_RCLONE_CONFIG" "$R2_CONFIG"

# Back up only application-owned relational objects. Supabase-managed schemas
# (including auth and storage) are recreated by the platform; Storage object
# bodies and bucket configuration are exported separately below.
"$PG_DUMP_BIN" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --file="$SET_DIR/application.dump"
test -s "$SET_DIR/application.dump"
"$PG_RESTORE_BIN" --list "$SET_DIR/application.dump" >/dev/null

mapfile -t application_tables < <(
  "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename;
  " | sed -e '/^$/d'
)
if [[ "${#application_tables[@]}" -eq 0 ]]; then
  echo "Application schema public contains no tables; refusing an empty database backup" >&2
  exit 1
fi

database_stats="$WORK_DIR/database-tables.ndjson"
: > "$database_stats"
for table in "${application_tables[@]}"; do
  if [[ ! "$table" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "Unsafe application table name: $table" >&2
    exit 1
  fi
  table_rows="$(
    "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --command="select count(*) from public.\"$table\";"
  )"
  [[ "$table_rows" =~ ^[0-9]+$ ]] || {
    echo "Invalid row count for public.$table" >&2
    exit 1
  }
  jq -cn --arg name "$table" --argjson rows "$table_rows" \
    '{name: $name, rows: $rows}' >> "$database_stats"
done
jq -s '{version: 1, schema: "public", tables: .}' \
  "$database_stats" > "$SET_DIR/database-tables.json"

migration_source="$REPO_ROOT/supabase/migrations"
mapfile -d '' -t migration_files < <(
  find "$migration_source" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z
)
if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "No Supabase migration SQL files found: $migration_source" >&2
  exit 1
fi
mkdir -p "$SET_DIR/migrations"
for migration_file in "${migration_files[@]}"; do
  cp -- "$migration_file" "$SET_DIR/migrations/"
done

mapfile -t buckets < <(
  rclone --config "$SUPABASE_RCLONE_CONFIG" lsf supabase: --dirs-only --format p \
    | sed -e 's:/$::' -e '/^$/d' \
    | LC_ALL=C sort
)

if [[ "${#buckets[@]}" -eq 0 ]]; then
  echo "Supabase Storage returned no buckets; refusing an incomplete backup" >&2
  exit 1
fi
if ! printf '%s\n' "${buckets[@]}" | grep --fixed-strings --line-regexp --quiet resume; then
  echo "Required private Supabase Storage bucket is missing: resume" >&2
  exit 1
fi

bucket_stats="$WORK_DIR/storage-buckets.ndjson"
: > "$bucket_stats"

for bucket in "${buckets[@]}"; do
  if [[ ! "$bucket" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
    echo "Unsafe Supabase Storage bucket name: $bucket" >&2
    exit 1
  fi

  destination="$SET_DIR/storage/$bucket"
  mkdir -p "$destination"

  source_size="$WORK_DIR/${bucket}.source-size.json"
  destination_size="$WORK_DIR/${bucket}.destination-size.json"
  rclone --config "$SUPABASE_RCLONE_CONFIG" size "supabase:$bucket" --json > "$source_size"
  rclone --config "$SUPABASE_RCLONE_CONFIG" copy "supabase:$bucket" "$destination" \
    --checkers 8 \
    --create-empty-src-dirs \
    --metadata \
    --transfers 4
  rclone --config "$SUPABASE_RCLONE_CONFIG" check "supabase:$bucket" "$destination" \
    --download \
    --one-way
  rclone size "$destination" --json > "$destination_size"

  source_objects="$(jq -er '.count | numbers' "$source_size")"
  source_bytes="$(jq -er '.bytes | numbers' "$source_size")"
  destination_objects="$(jq -er '.count | numbers' "$destination_size")"
  destination_bytes="$(jq -er '.bytes | numbers' "$destination_size")"
  if [[ "$source_objects" -ne "$destination_objects" || "$source_bytes" -ne "$destination_bytes" ]]; then
    echo "Supabase Storage copy differs for bucket $bucket" >&2
    exit 1
  fi

  bucket_config="$(
    "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
      select json_build_object(
        'id', id,
        'name', name,
        'public', public,
        'fileSizeLimit', file_size_limit,
        'allowedMimeTypes', allowed_mime_types
      )::text
      from storage.buckets
      where id = '$bucket' and name = '$bucket';
    "
  )"
  if ! jq -e --arg name "$bucket" '
    .id == $name and
    .name == $name and
    (.public | type == "boolean") and
    (.fileSizeLimit == null or (.fileSizeLimit | type == "number")) and
    (.allowedMimeTypes == null or (.allowedMimeTypes | type == "array"))
  ' <<< "$bucket_config" >/dev/null; then
    echo "Supabase database bucket configuration differs from S3 bucket $bucket" >&2
    exit 1
  fi

  jq -cn \
    --argjson bucket "$bucket_config" \
    --argjson objects "$source_objects" \
    --argjson bytes "$source_bytes" \
    '$bucket + {objects: $objects, bytes: $bytes}' >> "$bucket_stats"
done

jq -s '{version: 1, buckets: .}' "$bucket_stats" > "$SET_DIR/storage-buckets.json"
unset PGDATABASE
node "$CONTRACT_SCRIPT" create \
  "$SET_DIR" "$SET_ID" "$CREATED_AT" "$GITHUB_SHA" "$SUPABASE_PROJECT_REF" >/dev/null
node "$CONTRACT_SCRIPT" verify "$SET_DIR" >/dev/null

# Archive once, then encrypt before any bytes leave the runner.
tar --create --directory "$SET_DIR" . | zstd --threads=0 --quiet --output "$PLAINTEXT_ARCHIVE"
test -s "$PLAINTEXT_ARCHIVE"
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$ENCRYPTED_ARCHIVE" "$PLAINTEXT_ARCHIVE"
rm -f -- "$PLAINTEXT_ARCHIVE"
test -s "$ENCRYPTED_ARCHIVE"

node "$CONTRACT_SCRIPT" create-marker \
  "$ENCRYPTED_ARCHIVE" "$SET_ID" "$CREATED_AT" "$GITHUB_SHA" "$COMPLETE_MARKER" >/dev/null
node "$CONTRACT_SCRIPT" verify-marker "$ENCRYPTED_ARCHIVE" "$COMPLETE_MARKER" >/dev/null

# The completion marker is published only after the encrypted payload has been
# uploaded and read back byte-for-byte. Sets without a marker are never pruned
# or considered restorable.
remote_upload_started=true
rclone --config "$R2_CONFIG" --s3-no-check-bucket copyto "$ENCRYPTED_ARCHIVE" "$R2_ARCHIVE"
local_archive_checksum="$(sha256sum "$ENCRYPTED_ARCHIVE" | cut -d ' ' -f 1)"
remote_archive_checksum="$(
  rclone --config "$R2_CONFIG" --s3-no-check-bucket cat "$R2_ARCHIVE" \
    | sha256sum \
    | cut -d ' ' -f 1
)"
[[ "$local_archive_checksum" == "$remote_archive_checksum" ]]

rclone --config "$R2_CONFIG" --s3-no-check-bucket copyto "$COMPLETE_MARKER" "$R2_MARKER"
local_marker_checksum="$(sha256sum "$COMPLETE_MARKER" | cut -d ' ' -f 1)"
remote_marker_checksum="$(
  rclone --config "$R2_CONFIG" --s3-no-check-bucket cat "$R2_MARKER" \
    | sha256sum \
    | cut -d ' ' -f 1
)"
[[ "$local_marker_checksum" == "$remote_marker_checksum" ]]
remote_set_complete=true

# Retention is count-based and runs only after the new set is complete. Invalid
# markers fail closed: no prior set is deleted. A bucket lock may temporarily
# retain extra sets, which is safer than weakening immutability.
markers_dir="$WORK_DIR/markers"
verified_markers_dir="$WORK_DIR/verified-markers"
mkdir -p "$markers_dir" "$verified_markers_dir"
rclone --config "$R2_CONFIG" --s3-no-check-bucket copy "$R2_WEEKLY_ROOT" "$markers_dir" \
  --include '*/complete.json'

while IFS= read -r -d '' marker_path; do
  marker_set_id="$(basename "$(dirname "$marker_path")")"
  if [[ ! "$marker_set_id" =~ ^weekly-[0-9]{8}T[0-9]{6}Z-[0-9]+-[0-9]+$ ]]; then
    echo "Unsafe completion-marker directory: $marker_set_id" >&2
    exit 1
  fi
  rclone --config "$R2_CONFIG" --s3-no-check-bucket \
    cat "$R2_WEEKLY_ROOT/$marker_set_id/${marker_set_id}.tar.zst.age" \
    | node "$CONTRACT_SCRIPT" verify-marker-stream "$marker_path" >/dev/null
  mkdir -p "$verified_markers_dir/$marker_set_id"
  cp -- "$marker_path" "$verified_markers_dir/$marker_set_id/complete.json"
done < <(find "$markers_dir" -mindepth 2 -maxdepth 2 -type f -name complete.json -print0 | sort -z)

prunable_file="$WORK_DIR/prunable-sets.txt"
node "$CONTRACT_SCRIPT" retention \
  "$verified_markers_dir" "$RETAIN_COMPLETE_SETS" "$SET_ID" > "$prunable_file"
mapfile -t prunable_sets < "$prunable_file"
for old_set_id in "${prunable_sets[@]}"; do
  if ! rclone --config "$R2_CONFIG" --s3-no-check-bucket \
    deletefile "$R2_WEEKLY_ROOT/$old_set_id/complete.json"; then
    echo "::warning::R2 retention lock kept complete backup set $old_set_id"
    continue
  fi
  if ! rclone --config "$R2_CONFIG" --s3-no-check-bucket purge "$R2_WEEKLY_ROOT/$old_set_id"; then
    echo "::warning::Completion marker was removed, but residual payload cleanup failed for $old_set_id"
  fi
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "set_id=$SET_ID"
    echo "encrypted_path=$ENCRYPTED_ARCHIVE"
    echo "marker_path=$COMPLETE_MARKER"
  } >> "$GITHUB_OUTPUT"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  storage_objects="$(jq '[.buckets[].objects] | add' "$SET_DIR/storage-buckets.json")"
  storage_bytes="$(jq '[.buckets[].bytes] | add' "$SET_DIR/storage-buckets.json")"
  {
    echo "## Weekly backup completed"
    echo
    echo "- Set: \`$SET_ID\`"
    echo "- Database: PostgreSQL 17 custom archive of application schema \`public\`"
    echo "- Storage: $storage_objects objects / $storage_bytes bytes across ${#buckets[@]} bucket(s)"
    echo "- Durable target: \`katbose-backups/weekly/$SET_ID/\`"
    echo "- Verified: encrypted payload and completion marker read back with matching SHA-256"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "Completed encrypted weekly backup set: $SET_ID"
