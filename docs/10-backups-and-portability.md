# 10 — Backups, Disaster Recovery & Content Portability

[← Back to PLAN.md](../PLAN.md)

---

## 10.1 Why this is mandatory

Supabase's free tier has limited backups and **no point-in-time recovery**. A corrupted table, a
bad migration or a mistaken delete could take the entire blog with it. Backups are therefore
self-managed and automated from day one, not added after the first incident.

Three things must survive a total loss of every vendor account:

1. **The application database** — content, logs and pointers owned by application schemas
2. **Storage** — object bodies plus the bucket settings needed to reconstruct media and resume data
3. **The writing itself** — a portable format that does not need Payload to read

The database and every current Supabase Storage bucket are implemented by the baseline weekly
workflow. The portable JSON/MDX export is activated with Payload in Phase 2; until then there is no
CMS endpoint or authored content to export, and the Phase 2 backup gate remains open.

---

## 10.2 Weekly complete sets

`.github/workflows/weekly-backup.yml` runs at 03:00 UTC every Sunday (08:30 Asia/Kolkata) and can be
dispatched manually from protected `main`. It uses the `production` GitHub environment, asserts
`refs/heads/main` before checkout and persists no Git credential. Its implementation is split into:

- `scripts/backups/create-weekly-backup.sh` — source export, verification, encryption, publication
  and retention
- `scripts/backups/backup-set.mjs` — manifest, completion-marker and retention contracts
- `scripts/backups/restore-weekly-backup.ps1` — Windows/PowerShell 7 restore drill
- `scripts/backups/restore-weekly-backup.sh` — Linux/macOS restore drill

Every run creates a unique immutable set ID:

```text
weekly-YYYYMMDDTHHMMSSZ-GITHUB_RUN_ID-GITHUB_RUN_ATTEMPT
```

The plaintext staging set contains:

```text
application.dump                # PostgreSQL 17 custom archive of schema public
database-tables.json            # public table names and exact source row counts
migrations/*.sql                # committed Supabase migration snapshot
storage-buckets.json            # bucket settings plus source object/byte counts
storage/<bucket>/<objects...>   # every Supabase Storage object body
manifest.json                   # SHA-256 and byte size of every staged file
```

The workflow then produces one compressed and encrypted payload and one non-sensitive completion
marker:

```text
r2:katbose-backups/weekly/<set-id>/
├── <set-id>.tar.zst.age
└── complete.json
```

`complete.json` records only the set ID, creation time, Git SHA, encrypted object name, byte size and
SHA-256. It is written **last**, after the encrypted payload has been read back from R2 and matched
byte-for-byte. A prefix without a valid marker is incomplete and is never eligible for restore or
retention decisions.

### 10.2.1 Database path

The workflow installs the PostgreSQL 17 client from PGDG, matching the production PostgreSQL major.
It runs `pg_dump --format=custom --schema=public --no-owner --no-privileges`, rejects an empty
archive and requires `pg_restore --list` to succeed before encryption. The archive deliberately
contains only application-owned relational objects in `public`; Supabase-managed `auth`, `storage`
and extension schemas are recreated by the platform. Table names and source row counts are recorded
separately in `database-tables.json` for post-restore verification. Custom format is the one backup
format across the repository because it validates structurally and permits selective restore.

`SUPABASE_DB_URL` must be the IPv4-reachable **session-pooler** connection string. Supabase direct
connections are IPv6-first while GitHub-hosted runners are IPv4-only.

### 10.2.2 Storage path

Object bytes are not stored in the `public`-schema PostgreSQL archive. The workflow therefore uses
Supabase's [server-side S3 endpoint](https://supabase.com/docs/guides/storage/s3/authentication)
through an rclone remote named `supabase`. It separately records each bucket's `public`, file-size
limit and allowed-MIME settings from `storage.buckets`; it does not dump the full managed
`storage.objects` schema. It enumerates every bucket to exhaustion, requires the private `resume`
bucket, copies public and private objects, runs `rclone check --download`, and requires source and
destination object/byte counts to match. Any missing object or unreadable private bucket fails the
run; warnings never produce a green incomplete backup.

Supabase-generated S3 keys bypass Storage RLS and have full access across Storage buckets. They are
more narrowly scoped than a Supabase service-role key but are still privileged server credentials.
The multiline `SUPABASE_STORAGE_RCLONE_CONFIG` secret must therefore be stored only in the GitHub
`production` environment after that environment is restricted to protected branches; it must never
be available to application code:

```ini
[supabase]
type = s3
provider = Other
access_key_id = replace-with-supabase-s3-access-key
secret_access_key = replace-with-supabase-s3-secret-key
endpoint = https://ersangtaqrggqldfdbxq.storage.supabase.co/storage/v1/s3
region = ap-south-1
```

Generate the pair from **Supabase Dashboard → Storage → Configuration → S3** and save the secret
once. Do not substitute a public object URL: it cannot read `resume` and does not prove a private
backup.

### 10.2.3 Encryption, publication and retention

The set is compressed with zstd, encrypted with age and only then uploaded. CI receives the public
`BACKUP_AGE_RECIPIENT`; the private identity stays offline in at least two independently controlled
copies. Possession of GitHub or R2 credentials therefore does not reveal backup contents.

R2 is the normative durable target. The workflow also retains the ciphertext and marker as a
30-day GitHub artifact for convenience, but the artifact is not a backup substitute. After a new
marker is verified, retention validates all existing markers and keeps at least the newest four
complete sets. Invalid markers or a missing current marker fail closed without deleting anything.
A lock-blocked deletion retains an extra set and emits a warning rather than weakening immutability.

Cloudflare R2 does not implement S3 bucket versioning (`GetBucketVersioning`/`PutBucketVersioning`
are unsupported in the [R2 S3 compatibility table](https://developers.cloudflare.com/r2/api/s3/api/)).
The replacement is unique non-overwriting keys plus an R2
[bucket-lock rule](https://developers.cloudflare.com/r2/buckets/bucket-locks/) on `weekly/` for 21
days. That protects the three newest scheduled copies from deletion while allowing the fifth weekly
run to prune an older unlocked set. The lock is a remote security control and must be verified
separately; committing the workflow alone does not enable it.

---

## 10.3 Content export — the anti-lock-in layer

Once Payload exists, every collection and global is exported weekly in two forms:

- **JSON** — complete fidelity for restoring into Payload
- **MDX** — human-readable and portable for restoring into another CMS or a static site

The exporter must fetch every page until `totalPages`, validate every response before publication,
and add collection/global counts plus per-file checksums to the same set manifest. It covers Blog,
TIE, Projects, Experience, Profile and SiteSettings; media object bytes remain owned by the Storage
path above. A fixed `limit=1000` request is forbidden.

Encrypted JSON/MDX exports join the database and Storage payload in private off-primary R2. A
private `katbose-content-backup` repository may additionally receive readable exports, but it is a
portable convenience copy, not the durable target. This is also why
[02-content-model.md](02-content-model.md) mandates conservative field design: every exotic block is
a special case in a future serializer.

**Current status (2026-08-28):** Payload and `CMS_URL` do not exist, so this exporter is deliberately
not fabricated or marked complete. The weekly database/Storage baseline may run first; the full
Phase 2 gate requires adding and exercising the JSON/MDX path.

---

## 10.4 Restore procedure

Restores require Node.js 24, age, rclone, zstd, tar and PostgreSQL 17 client tools; the Bash
implementation additionally requires Bash 4+, jq and sha256sum. They always target a disposable
**scratch database**, never production. The scripts require the literal
`RESTORE_CONFIRMATION=RESTORE BACKUP TO SCRATCH`, download the marker and ciphertext from R2,
verify SHA-256, decrypt with the offline age identity, reject unsafe archive entry types and paths,
verify every manifest entry and its marker identity, validate `application.dump`, and then restore
with `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges`. Full restore
requires an empty `public` schema and Supabase-compatible `anon`, `authenticated` and `service_role`
roles; it never uses `--clean`. The restored table set and every row count must exactly match the
backup metadata.

### Windows / PowerShell 7

```powershell
$env:BACKUP_SET_ID = "weekly-YYYYMMDDTHHMMSSZ-RUN-ID-1"
$env:BACKUP_AGE_IDENTITY = "D:\offline\katbose-backups.agekey"
$env:R2_RCLONE_CONFIG = Get-Content "D:\offline\r2-rclone.conf" -Raw
$env:SCRATCH_DB_URL = "postgresql://postgres:password@localhost:5432/katbose_restore"
$env:RESTORE_CONFIRMATION = "RESTORE BACKUP TO SCRATCH"

pwsh scripts/backups/restore-weekly-backup.ps1
```

The PowerShell script is the native Windows full-restore drill. It is intentionally retained so
recovery does not depend on WSL. The Bash script additionally supports
`RESTORE_DATABASE_MODE=data-only` after migrations have been applied to a fresh target.

Because Supabase Storage keys may legally contain characters Windows filenames cannot represent,
the PowerShell script refuses an archive containing a path with `:`, `?`, `*`, `<`, `>`, `|`, a
trailing dot or space, or a reserved device name such as `CON` or `LPT1`. That check fails before
extraction with `Archive path is not portable to Windows`. The set is not corrupt: restore it with
`restore-weekly-backup.sh` under Linux or WSL, and rename the offending object in Storage so future
sets stay restorable on either platform.

### Linux / Bash 4+ (macOS requires modern Bash and GNU tools)

```bash
export BACKUP_SET_ID="weekly-YYYYMMDDTHHMMSSZ-RUN-ID-1"
export BACKUP_AGE_IDENTITY="/offline/katbose-backups.agekey"
export R2_RCLONE_CONFIG="$(cat /offline/r2-rclone.conf)"
export SCRATCH_DB_URL="postgresql://postgres:password@localhost:5432/katbose_restore"
export RESTORE_CONFIRMATION="RESTORE BACKUP TO SCRATCH"

bash scripts/backups/restore-weekly-backup.sh
```

Both scripts remove decrypted material on exit. By default, they verify the archived Storage
objects without writing them anywhere. A provider-loss exercise may additionally set
`TARGET_STORAGE_RCLONE_CONFIG` to a disposable Supabase S3 remote named `supabase`; every archived
object is then copied and checked. This optional object-copy step is **not** a complete or
failure-atomic Storage recovery: destination buckets and their recorded visibility, size and MIME
policy must be recreated first, destination emptiness must be verified by the operator, and the
current one-way check does not reject unrelated destination objects. Never point it at production.
Record these manual policy and target checks as part of the restore drill.

Perform the first real drill immediately after the first successful weekly run, whenever the schema
changes materially, and quarterly thereafter. Record the set ID, target, table/object counts and
result. An archive that only passes `pg_restore --list` is structurally readable; it is not a proven
restore until the scratch `pg_restore` succeeds.

---

## 10.5 Recovery scenarios

| Scenario | Recovery |
| --- | --- |
| Accidental content delete | Restore that document from the latest JSON export, or re-create from MDX |
| Bad migration on production | Restore the newest weekly dump into scratch and extract the affected tables |
| Supabase project lost | Create a project, restore the database, recreate project-level settings and copy every archived Storage bucket through S3 |
| Payload/Render lost | Create `katbose-cms` from `render.yaml`, reconnect the restored database and redeploy |
| Payload abandoned | Rebuild around the JSON/MDX exports; writing is not trapped in Payload |
| Search index corrupted | Rebuild it from the CMS through reconciliation; it is derived data |

Project-level API keys, Auth settings, Edge Function deployment state and provider account settings
are configuration, not database rows. Recreate them from repository configuration and the secret
inventory during a total-project recovery.

---

## 10.6 What is not backed up

- **PostHog and Sentry data** — telemetry, acceptable to lose
- **Upstash counters** — ephemeral; losing them resets rate-limit windows
- **Cloudflare AI Search index** — regenerated by reconciliation
- **GitHub/Cloudflare/Supabase account configuration** — recreated from repository docs and provider
  settings; credentials are rotated, never restored from a backup

Documenting these explicitly prevents a false sense of coverage.

---

## 10.7 Automated drill

`create-weekly-backup.sh` binds every target to the hosted project named by `SUPABASE_PROJECT_REF`,
which meant it could originally only ever run against production. Nothing exercised it, and it
shipped a defect that would have failed every scheduled run. `BACKUP_TARGET_PROFILE` closes that
gap:

| Profile | Behaviour |
| --- | --- |
| `production` (default, and what the workflow uses) | Requires the hosted project's direct host or pooler user, and its `*.storage.supabase.co` S3 endpoint |
| `local-drill` | Requires the database, Storage endpoint **and** object store to all be loopback |

`local-drill` is a narrowing, not an escape hatch: it refuses any non-loopback target, so a drill
can neither read a hosted project nor let retention delete a real set. Production behaviour is
unchanged because the workflow never sets the variable.

`.github/workflows/backup-drill.yml` runs `scripts/backups/run-backup-drill.sh` on every pull
request touching `scripts/backups/**` or `supabase/migrations/**`. It uses **no secrets** and
contacts no provider: local Supabase supplies PostgreSQL 17 and Storage, a local S3 server stands in
for R2, and the age identity is generated and discarded inside the job. The drill:

1. seeds all five `public` tables, including a 1 KiB message, and uploads a 1 KiB random object to
   the private `resume` bucket
2. runs the real creator three times with `RETAIN_COMPLETE_SETS=2`, then asserts the oldest set was
   pruned and its prefix left no residual payload
3. independently pulls the ciphertext, decrypts it with the throwaway identity and asserts the
   archived object's SHA-256 and length match the source and the manifest
4. runs the real Bash restore into a scratch database and asserts the table set, every row count,
   the resume pointer, and the 1 KiB payload's SHA-256 read back from PostgreSQL
5. asserts `local-drill` refuses a hosted Supabase host

Row counts alone cannot detect silently corrupted column data, which is why the drill compares
digests on both the database payload and the Storage object.

Two things the drill deliberately does not prove, because they need infrastructure it has no access
to: `RESTORE_DATABASE_MODE=data-only`, which requires a second full Supabase project with the
managed `storage` schema present, and R2 bucket-lock semantics, which no local S3 server replicates.
Both still require a production drill.
