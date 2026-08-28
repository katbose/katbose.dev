#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly CONTRACT_SCRIPT="$SCRIPT_DIR/backup-set.mjs"
readonly PG_RESTORE_BIN="${PG_RESTORE_BIN:-/usr/lib/postgresql/17/bin/pg_restore}"
readonly PSQL_BIN="${PSQL_BIN:-/usr/lib/postgresql/17/bin/psql}"
readonly RESTORE_DATABASE_MODE="${RESTORE_DATABASE_MODE:-full}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: $name" >&2
    exit 1
  fi
}

for name in \
  BACKUP_SET_ID \
  BACKUP_AGE_IDENTITY \
  R2_RCLONE_CONFIG \
  SCRATCH_DB_URL \
  RESTORE_CONFIRMATION; do
  require_env "$name"
done

if [[ "$RESTORE_CONFIRMATION" != "RESTORE BACKUP TO SCRATCH" ]]; then
  echo "Set RESTORE_CONFIRMATION to RESTORE BACKUP TO SCRATCH" >&2
  exit 1
fi
if [[ ! "$BACKUP_SET_ID" =~ ^weekly-[0-9]{8}T[0-9]{6}Z-[0-9]+-[0-9]+$ ]]; then
  echo "Invalid weekly backup set ID: $BACKUP_SET_ID" >&2
  exit 1
fi
if [[ "$RESTORE_DATABASE_MODE" != "full" && "$RESTORE_DATABASE_MODE" != "data-only" ]]; then
  echo "RESTORE_DATABASE_MODE must be full or data-only" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_AGE_IDENTITY" ]]; then
  echo "Offline age identity is not a readable file: $BACKUP_AGE_IDENTITY" >&2
  exit 1
fi

for command in age jq node rclone sha256sum tar zstd; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required restore tool is unavailable: $command" >&2
    exit 1
  }
done
[[ -x "$PG_RESTORE_BIN" ]] || {
  echo "PostgreSQL 17 pg_restore is unavailable: $PG_RESTORE_BIN" >&2
  exit 1
}
[[ -x "$PSQL_BIN" ]] || {
  echo "PostgreSQL 17 psql is unavailable: $PSQL_BIN" >&2
  exit 1
}
[[ "$($PG_RESTORE_BIN --version | grep -oE '[0-9]+' | head -n 1)" == "17" ]]
[[ "$($PSQL_BIN --version | grep -oE '[0-9]+' | head -n 1)" == "17" ]]

readonly WORK_ROOT="${RESTORE_WORK_ROOT:-${TMPDIR:-/tmp}}"
WORK_DIR="$(mktemp -d "$WORK_ROOT/katbose-restore.XXXXXX")"
readonly WORK_DIR
readonly R2_CONFIG="$WORK_DIR/r2-rclone.conf"
readonly REMOTE_ROOT="r2:katbose-backups/weekly/$BACKUP_SET_ID"
readonly ENCRYPTED_ARCHIVE="$WORK_DIR/${BACKUP_SET_ID}.tar.zst.age"
readonly COMPLETE_MARKER="$WORK_DIR/complete.json"
readonly PLAINTEXT_ARCHIVE="$WORK_DIR/${BACKUP_SET_ID}.tar.zst"
readonly EXTRACTED_SET="$WORK_DIR/set"

cleanup() {
  local exit_code=$?
  trap - EXIT
  rm -rf -- "$WORK_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

printf '%s' "$R2_RCLONE_CONFIG" > "$R2_CONFIG"
chmod 600 "$R2_CONFIG"
mkdir -p "$EXTRACTED_SET"

rclone --config "$R2_CONFIG" --s3-no-check-bucket copyto \
  "$REMOTE_ROOT/complete.json" "$COMPLETE_MARKER"
rclone --config "$R2_CONFIG" --s3-no-check-bucket copyto \
  "$REMOTE_ROOT/${BACKUP_SET_ID}.tar.zst.age" "$ENCRYPTED_ARCHIVE"
node "$CONTRACT_SCRIPT" verify-marker "$ENCRYPTED_ARCHIVE" "$COMPLETE_MARKER" >/dev/null

age --decrypt \
  --identity "$BACKUP_AGE_IDENTITY" \
  --output "$PLAINTEXT_ARCHIVE" \
  "$ENCRYPTED_ARCHIVE"
test -s "$PLAINTEXT_ARCHIVE"

# Reject links, devices, absolute paths, drive paths and traversal before
# extraction. The public age recipient provides confidentiality, while this
# preflight keeps a compromised object-store payload inside the work directory.
archive_entries="$WORK_DIR/archive-entries.txt"
zstd --decompress --stdout "$PLAINTEXT_ARCHIVE" \
  | tar --list --verbose --file=- > "$archive_entries"
while IFS= read -r archive_entry; do
  entry_type="${archive_entry:0:1}"
  if [[ "$entry_type" != "-" && "$entry_type" != "d" ]]; then
    echo "Unsafe non-file archive entry: $archive_entry" >&2
    exit 1
  fi
done < "$archive_entries"

archive_listing="$WORK_DIR/archive-paths.txt"
zstd --decompress --stdout "$PLAINTEXT_ARCHIVE" | tar --list --file=- > "$archive_listing"
while IFS= read -r archive_path; do
  normalized="${archive_path#./}"
  if [[
    "$normalized" == *\\* ||
    "$normalized" == /* ||
    "$normalized" == //* ||
    "$normalized" =~ ^[A-Za-z]: ||
    "$normalized" == ".." ||
    "$normalized" == ../* ||
    "$normalized" == */.. ||
    "$normalized" == */../*
  ]]; then
    echo "Unsafe path in backup archive: $archive_path" >&2
    exit 1
  fi
done < "$archive_listing"

zstd --decompress --stdout "$PLAINTEXT_ARCHIVE" \
  | tar --extract --no-same-owner --no-same-permissions --file=- --directory "$EXTRACTED_SET"
node "$CONTRACT_SCRIPT" verify-pair "$EXTRACTED_SET" "$COMPLETE_MARKER" >/dev/null
application_dump="$EXTRACTED_SET/application.dump"
"$PG_RESTORE_BIN" --list "$application_dump" >/dev/null
mapfile -t expected_tables < <(
  jq -er '.tables[] | select(.name | test("^[a-z_][a-z0-9_]*$")) | .name' \
    "$EXTRACTED_SET/database-tables.json"
)
if [[ "${#expected_tables[@]}" -eq 0 ]]; then
  echo "Backup declares no application tables" >&2
  exit 1
fi

# shellcheck source=scripts/backups/pg-connection-env.sh
source "$SCRIPT_DIR/pg-connection-env.sh"
export_pg_environment "$SCRATCH_DB_URL"
unset SCRATCH_DB_URL
mapfile -t target_tables < <(
  "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename;
  " | sed -e '/^$/d'
)

# Without --dbname, pg_restore writes a script to stdout instead of connecting,
# so the database name must be passed explicitly. It is not a secret; the
# password stays in PGPASSWORD.
restore_arguments=(
  --exit-on-error --single-transaction --no-owner --no-privileges
  --dbname="$PGDATABASE"
)
if [[ "$RESTORE_DATABASE_MODE" == "full" ]]; then
  if [[ "${#target_tables[@]}" -ne 0 ]]; then
    echo "Full restore requires an empty public schema in the scratch database" >&2
    exit 1
  fi
  compatible_roles="$(
    "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
      select count(*)
      from pg_catalog.pg_roles
      where rolname in ('anon', 'authenticated', 'service_role');
    "
  )"
  if [[ "$compatible_roles" != "3" ]]; then
    echo "Full restore requires Supabase-compatible anon, authenticated and service_role roles" >&2
    exit 1
  fi
  # Supabase owns schema public with a real role rather than pg_database_owner,
  # so the archive contains CREATE SCHEMA public. Every fresh database already
  # has that schema, which would abort the restore. Dropping it first lets the
  # archive recreate it with the source owner and ACLs. RESTRICT refuses to
  # cascade, so anything unexpected in the schema stops the restore instead.
  "$PSQL_BIN" --set=ON_ERROR_STOP=1 --quiet \
    --command="drop schema if exists public restrict;" > /dev/null
else
  if [[ "$(printf '%s\n' "${target_tables[@]}")" != "$(printf '%s\n' "${expected_tables[@]}")" ]]; then
    echo "Data-only restore requires the exact migration-created application table set" >&2
    exit 1
  fi
  for table in "${target_tables[@]}"; do
    target_rows="$(
      "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 \
        --command="select count(*) from public.\"$table\";"
    )"
    if [[ "$target_rows" != "0" ]]; then
      echo "Data-only restore requires empty target table public.$table" >&2
      exit 1
    fi
  done
  restore_arguments+=(--data-only)
fi

# Full mode restores into an empty compatible scratch database. Data-only mode
# restores after the embedded migrations have been applied to a fresh project.
"$PG_RESTORE_BIN" "${restore_arguments[@]}" "$application_dump"

mapfile -t restored_tables < <(
  "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename;
  " | sed -e '/^$/d'
)
if [[ "$(printf '%s\n' "${restored_tables[@]}")" != "$(printf '%s\n' "${expected_tables[@]}")" ]]; then
  echo "Restored application table set differs from the backup manifest" >&2
  exit 1
fi

restored_rows=0
while IFS=$'\t' read -r table expected_rows; do
  if [[ ! "$table" =~ ^[a-z_][a-z0-9_]*$ || ! "$expected_rows" =~ ^[0-9]+$ ]]; then
    echo "Unsafe database table statistics in backup" >&2
    exit 1
  fi
  actual_rows="$(
    "$PSQL_BIN" --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --command="select count(*) from public.\"$table\";"
  )"
  if [[ "$actual_rows" != "$expected_rows" ]]; then
    echo "Restored row count differs for public.$table" >&2
    exit 1
  fi
  restored_rows=$((restored_rows + actual_rows))
done < <(jq -r '.tables[] | [.name, .rows] | @tsv' "$EXTRACTED_SET/database-tables.json")

# Optional provider-loss exercise: when supplied, restore every archived bucket
# through a destination Supabase S3 remote named `supabase` and verify it.
if [[ -n "${TARGET_STORAGE_RCLONE_CONFIG:-}" ]]; then
  target_config="$WORK_DIR/target-storage-rclone.conf"
  printf '%s' "$TARGET_STORAGE_RCLONE_CONFIG" > "$target_config"
  chmod 600 "$target_config"

  while IFS= read -r bucket; do
    [[ -n "$bucket" ]] || continue
    rclone --config "$target_config" copy "$EXTRACTED_SET/storage/$bucket" "supabase:$bucket" \
      --checkers 8 \
      --metadata \
      --transfers 4
    rclone --config "$target_config" check "$EXTRACTED_SET/storage/$bucket" "supabase:$bucket" \
      --download \
      --one-way
  done < <(jq -r '.buckets[].name' "$EXTRACTED_SET/storage-buckets.json")
else
  echo "Storage payload integrity passed; destination Storage restore skipped (TARGET_STORAGE_RCLONE_CONFIG not set)."
fi

echo "Restore drill passed for $BACKUP_SET_ID (${#restored_tables[@]} tables, $restored_rows rows)."
