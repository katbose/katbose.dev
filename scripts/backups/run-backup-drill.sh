#!/usr/bin/env bash

# Executes the real weekly backup and restore scripts end to end against
# disposable loopback infrastructure: a local Supabase project supplies
# PostgreSQL 17 and Storage, and a local S3 server stands in for R2.
#
# This exists because create-weekly-backup.sh binds every target to the hosted
# project, so before BACKUP_TARGET_PROFILE=local-drill it could only ever run
# against production -- which is why it shipped a defect that failed every run.
# The drill seeds real rows and a real 1 KiB object, then proves the bytes
# survive the full dump -> manifest -> tar -> zstd -> age -> object-store ->
# restore path. See docs/10-backups-and-portability.md §10.7.

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# A 20-character placeholder that satisfies the contract's project-reference
# rule. Under local-drill the value is never used to reach a hosted project.
readonly DRILL_PROJECT_REF="localdrillproject000"
readonly DRILL_BUCKET="resume"
readonly OBJECT_KEY="drill/katbose-drill-1kib.bin"
readonly SCRATCH_DATABASE="katbose_restore_drill"
readonly RETAIN_SETS=2
readonly DRILL_ITERATIONS=3

readonly PSQL_BIN="${PSQL_BIN:-/usr/lib/postgresql/17/bin/psql}"
readonly SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-127.0.0.1}"
readonly SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-54322}"
readonly SUPABASE_DB_USER="${SUPABASE_DB_USER:-postgres}"
readonly SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-postgres}"
readonly SUPABASE_STORAGE_ENDPOINT="${SUPABASE_STORAGE_ENDPOINT:-http://127.0.0.1:54321/storage/v1/s3}"
readonly OBJECT_STORE_ENDPOINT="${OBJECT_STORE_ENDPOINT:-http://127.0.0.1:9000}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: $name" >&2
    exit 1
  fi
}

for name in \
  SUPABASE_S3_ACCESS_KEY \
  SUPABASE_S3_SECRET_KEY \
  OBJECT_STORE_ACCESS_KEY \
  OBJECT_STORE_SECRET_KEY \
  GITHUB_SHA \
  GITHUB_RUN_ID \
  RUNNER_TEMP; do
  require_env "$name"
done

for command in age age-keygen jq node rclone sha256sum tar zstd; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required drill tool is unavailable: $command" >&2
    exit 1
  }
done
[[ -x "$PSQL_BIN" ]] || {
  echo "PostgreSQL 17 psql is unavailable: $PSQL_BIN" >&2
  exit 1
}

readonly DRILL_DB_URL="postgresql://${SUPABASE_DB_USER}:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT}/postgres"
readonly DRILL_SCRATCH_DB_URL="postgresql://${SUPABASE_DB_USER}:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT}/${SCRATCH_DATABASE}"

WORK_DIR="$(mktemp -d "${RUNNER_TEMP}/katbose-backup-drill.XXXXXX")"
readonly WORK_DIR
readonly AGE_IDENTITY="$WORK_DIR/drill-identity.age"
readonly SUPABASE_CONFIG="$WORK_DIR/supabase-rclone.conf"
readonly R2_CONFIG="$WORK_DIR/r2-rclone.conf"
readonly SOURCE_OBJECT="$WORK_DIR/source-1kib.bin"
readonly INSPECT_DIR="$WORK_DIR/inspect"

cleanup() {
  local exit_code=$?
  trap - EXIT
  rm -rf -- "$WORK_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

step() {
  echo ""
  echo "=== $* ==="
}

drill_psql() {
  "$PSQL_BIN" "$DRILL_DB_URL" --tuples-only --no-align --set=ON_ERROR_STOP=1 "$@"
}

scratch_psql() {
  "$PSQL_BIN" "$DRILL_SCRATCH_DB_URL" --tuples-only --no-align --set=ON_ERROR_STOP=1 "$@"
}

assert_equal() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "DRILL FAILED: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  fi
  echo "  ok: $label ($actual)"
}

step "Generating a throwaway age identity"
age-keygen --output "$AGE_IDENTITY" 2>/dev/null
DRILL_AGE_RECIPIENT="$(age-keygen -y "$AGE_IDENTITY")"
readonly DRILL_AGE_RECIPIENT
echo "  recipient: $DRILL_AGE_RECIPIENT"

step "Writing loopback rclone configuration"
cat > "$SUPABASE_CONFIG" <<EOF
[supabase]
type = s3
provider = Other
access_key_id = ${SUPABASE_S3_ACCESS_KEY}
secret_access_key = ${SUPABASE_S3_SECRET_KEY}
endpoint = ${SUPABASE_STORAGE_ENDPOINT}
region = local
force_path_style = true
EOF
cat > "$R2_CONFIG" <<EOF
[r2]
type = s3
provider = Minio
access_key_id = ${OBJECT_STORE_ACCESS_KEY}
secret_access_key = ${OBJECT_STORE_SECRET_KEY}
endpoint = ${OBJECT_STORE_ENDPOINT}
region = us-east-1
force_path_style = true
acl = private
EOF
chmod 600 "$SUPABASE_CONFIG" "$R2_CONFIG"

# The creator uses --s3-no-check-bucket, so the destination bucket must exist.
rclone --config "$R2_CONFIG" mkdir "r2:katbose-backups"

step "Seeding a 1 KiB database payload and a 1 KiB Storage object"
# 1024 printable characters with no surrounding whitespace, so the
# contact_submissions length and btrim checks both accept it.
# Built in-shell rather than through `yes | head`, whose SIGPIPE trips pipefail.
DB_PAYLOAD=""
while ((${#DB_PAYLOAD} < 1024)); do
  DB_PAYLOAD+="katbose-drill-payload."
done
DB_PAYLOAD="${DB_PAYLOAD:0:1024}"
readonly DB_PAYLOAD
assert_equal "seeded database payload is 1 KiB" "1024" "${#DB_PAYLOAD}"
DB_PAYLOAD_SHA="$(printf '%s' "$DB_PAYLOAD" | sha256sum | cut -d ' ' -f 1)"
readonly DB_PAYLOAD_SHA

head -c 1024 /dev/urandom > "$SOURCE_OBJECT"
assert_equal "seeded Storage object is 1 KiB" "1024" "$(wc -c < "$SOURCE_OBJECT" | tr -d ' ')"
OBJECT_SHA="$(sha256sum "$SOURCE_OBJECT" | cut -d ' ' -f 1)"
readonly OBJECT_SHA

# Random binary content proves the bytes actually travelled rather than a
# fixture coincidentally matching.
rclone --config "$SUPABASE_CONFIG" copyto "$SOURCE_OBJECT" "supabase:${DRILL_BUCKET}/${OBJECT_KEY}"

drill_psql --command="
  truncate table
    public.contact_submissions,
    public.download_logs,
    public.resume_versions,
    public.dead_letter_queue,
    public.ai_query_logs;
" > /dev/null

# psql interpolates :'variable' for file input but not for --command, and
# passing the payload as a variable keeps it out of the SQL text entirely.
readonly SEED_SQL="$WORK_DIR/seed.sql"
cat > "$SEED_SQL" <<'SQL'
insert into public.contact_submissions (name, email, message)
values ('KatBose Drill', 'drill@katbose.dev', :'payload');

insert into public.download_logs (storage_path, success, ip_pseudonym, ip_epoch)
values (:'path', true, 'drill-pseudonym', 'epoch-1'),
       (:'path', false, null, null);

insert into public.resume_versions (storage_path, is_current)
values (:'path', true);

insert into public.dead_letter_queue (collection, doc_id, slug, operation, attempts)
values ('blog-posts', 'doc-1', 'drill-post', 'upsert', 2);

insert into public.ai_query_logs (query, flagged, answered)
values ('what does the drill prove', false, true);
SQL

"$PSQL_BIN" "$DRILL_DB_URL" --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --set=payload="$DB_PAYLOAD" \
  --set=path="${DRILL_BUCKET}/${OBJECT_KEY}" \
  --file "$SEED_SQL" > /dev/null

declare -A EXPECTED_ROWS=(
  [contact_submissions]=1
  [download_logs]=2
  [resume_versions]=1
  [dead_letter_queue]=1
  [ai_query_logs]=1
)

step "Running the real creator ${DRILL_ITERATIONS}x to exercise retention (keep ${RETAIN_SETS})"
declare -a PUBLISHED_SETS=()
for attempt in $(seq 1 "$DRILL_ITERATIONS"); do
  echo "--- creator attempt $attempt ---"
  # GITHUB_RUN_ATTEMPT keeps each set ID unique when two runs share one second.
  BACKUP_TARGET_PROFILE="local-drill" \
  RETAIN_COMPLETE_SETS="$RETAIN_SETS" \
  SUPABASE_DB_URL="$DRILL_DB_URL" \
  SUPABASE_PROJECT_REF="$DRILL_PROJECT_REF" \
  SUPABASE_STORAGE_RCLONE_CONFIG="$(cat "$SUPABASE_CONFIG")" \
  R2_RCLONE_CONFIG="$(cat "$R2_CONFIG")" \
  BACKUP_AGE_RECIPIENT="$DRILL_AGE_RECIPIENT" \
  GITHUB_RUN_ATTEMPT="$attempt" \
  GITHUB_OUTPUT="" \
  GITHUB_STEP_SUMMARY="" \
    bash "$SCRIPT_DIR/create-weekly-backup.sh"

  latest="$(
    rclone --config "$R2_CONFIG" lsf "r2:katbose-backups/weekly" --dirs-only \
      | sed -e 's:/$::' -e '/^$/d' \
      | LC_ALL=C sort \
      | tail -n 1
  )"
  PUBLISHED_SETS+=("$latest")
  echo "  published: $latest"
done

step "Verifying count-based retention pruned the oldest set"
mapfile -t remaining_sets < <(
  rclone --config "$R2_CONFIG" lsf "r2:katbose-backups/weekly" --dirs-only \
    | sed -e 's:/$::' -e '/^$/d' \
    | LC_ALL=C sort
)
assert_equal "retained set count" "$RETAIN_SETS" "${#remaining_sets[@]}"
for remaining in "${remaining_sets[@]}"; do
  if [[ "$remaining" == "${PUBLISHED_SETS[0]}" ]]; then
    echo "DRILL FAILED: retention kept the oldest set ${PUBLISHED_SETS[0]}" >&2
    exit 1
  fi
done
echo "  ok: oldest set ${PUBLISHED_SETS[0]} was pruned"
# A pruned prefix must leave no residual payload behind.
assert_equal "pruned prefix is empty" "0" \
  "$(rclone --config "$R2_CONFIG" lsf "r2:katbose-backups/weekly/${PUBLISHED_SETS[0]}" 2>/dev/null | wc -l | tr -d ' ')"

readonly TARGET_SET="${PUBLISHED_SETS[-1]}"
step "Independently decrypting ${TARGET_SET} to prove object byte fidelity"
mkdir -p "$INSPECT_DIR/set"
rclone --config "$R2_CONFIG" cat "r2:katbose-backups/weekly/${TARGET_SET}/${TARGET_SET}.tar.zst.age" \
  > "$INSPECT_DIR/payload.age"
age --decrypt --identity "$AGE_IDENTITY" --output "$INSPECT_DIR/payload.tar.zst" "$INSPECT_DIR/payload.age"
zstd --decompress --stdout "$INSPECT_DIR/payload.tar.zst" \
  | tar --extract --file=- --directory "$INSPECT_DIR/set"

restored_object="$INSPECT_DIR/set/storage/${DRILL_BUCKET}/${OBJECT_KEY}"
[[ -f "$restored_object" ]] || {
  echo "DRILL FAILED: archived Storage object is missing: storage/${DRILL_BUCKET}/${OBJECT_KEY}" >&2
  exit 1
}
assert_equal "archived object SHA-256 matches the source" \
  "$OBJECT_SHA" "$(sha256sum "$restored_object" | cut -d ' ' -f 1)"
assert_equal "archived object is still 1 KiB" "1024" \
  "$(wc -c < "$restored_object" | tr -d ' ')"
assert_equal "manifest records the same object digest" "$OBJECT_SHA" "$(
  jq -r --arg path "storage/${DRILL_BUCKET}/${OBJECT_KEY}" \
    '.files[] | select(.path == $path) | .sha256' "$INSPECT_DIR/set/manifest.json"
)"
assert_equal "manifest bound the drill project reference" "$DRILL_PROJECT_REF" \
  "$(jq -r '.source.supabaseProjectRef' "$INSPECT_DIR/set/manifest.json")"

step "Restoring ${TARGET_SET} into a scratch database"
drill_psql --command="drop database if exists ${SCRATCH_DATABASE};" > /dev/null
drill_psql --command="create database ${SCRATCH_DATABASE};" > /dev/null

BACKUP_SET_ID="$TARGET_SET" \
BACKUP_AGE_IDENTITY="$AGE_IDENTITY" \
R2_RCLONE_CONFIG="$(cat "$R2_CONFIG")" \
SCRATCH_DB_URL="$DRILL_SCRATCH_DB_URL" \
RESTORE_CONFIRMATION="RESTORE BACKUP TO SCRATCH" \
RESTORE_DATABASE_MODE="full" \
  bash "$SCRIPT_DIR/restore-weekly-backup.sh"

step "Verifying restored database fidelity"
assert_equal "restored table count" "${#EXPECTED_ROWS[@]}" "$(
  scratch_psql --command="select count(*) from pg_catalog.pg_tables where schemaname = 'public';"
)"
for table in "${!EXPECTED_ROWS[@]}"; do
  assert_equal "restored row count for public.$table" "${EXPECTED_ROWS[$table]}" \
    "$(scratch_psql --command="select count(*) from public.\"$table\";")"
done

# Row counts alone cannot detect silently corrupted column data.
assert_equal "restored 1 KiB database payload SHA-256" "$DB_PAYLOAD_SHA" "$(
  scratch_psql --command="select encode(sha256(convert_to(message, 'UTF8')), 'hex') from public.contact_submissions;"
)"
assert_equal "restored payload length" "1024" "$(
  scratch_psql --command="select char_length(message) from public.contact_submissions;"
)"
assert_equal "restored resume pointer" "${DRILL_BUCKET}/${OBJECT_KEY}" "$(
  scratch_psql --command="select storage_path from public.resume_versions where is_current;"
)"

step "Confirming the drill profile refuses a non-loopback target"
set +e
refusal="$(
  BACKUP_TARGET_PROFILE="local-drill" \
  SUPABASE_DB_URL="postgresql://postgres:secret@db.ersangtaqrggqldfdbxq.supabase.co:5432/postgres" \
  SUPABASE_PROJECT_REF="$DRILL_PROJECT_REF" \
  SUPABASE_STORAGE_RCLONE_CONFIG="$(cat "$SUPABASE_CONFIG")" \
  R2_RCLONE_CONFIG="$(cat "$R2_CONFIG")" \
  BACKUP_AGE_RECIPIENT="$DRILL_AGE_RECIPIENT" \
  GITHUB_RUN_ATTEMPT="99" \
    bash "$SCRIPT_DIR/create-weekly-backup.sh" 2>&1
)"
refusal_status=$?
set -e
if [[ "$refusal_status" -eq 0 ]]; then
  echo "DRILL FAILED: local-drill accepted a hosted Supabase host" >&2
  exit 1
fi
grep --quiet "must be a loopback database" <<< "$refusal" || {
  echo "DRILL FAILED: unexpected refusal reason: $refusal" >&2
  exit 1
}
echo "  ok: hosted host refused under local-drill"

step "Drill passed"
echo "Set:              $TARGET_SET"
echo "Retained sets:    ${remaining_sets[*]}"
echo "Database payload: 1024 bytes, SHA-256 $DB_PAYLOAD_SHA"
echo "Storage object:   1024 bytes, SHA-256 $OBJECT_SHA"
echo "Scratch target:   $SCRATCH_DATABASE"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Backup drill passed"
    echo ""
    echo "- Restored set: \`$TARGET_SET\`"
    echo "- Tables restored: ${#EXPECTED_ROWS[@]} with exact row counts"
    echo "- 1 KiB database payload verified byte-for-byte (SHA-256 \`$DB_PAYLOAD_SHA\`)"
    echo "- 1 KiB Storage object verified byte-for-byte (SHA-256 \`$OBJECT_SHA\`)"
    echo "- Retention kept the newest $RETAIN_SETS sets and purged the oldest prefix"
    echo "- \`local-drill\` refused a hosted Supabase host"
  } >> "$GITHUB_STEP_SUMMARY"
fi
