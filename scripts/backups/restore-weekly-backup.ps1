Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RequiredEnvironmentVariable {
  param([Parameter(Mandatory)][string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required environment variable is missing: $Name"
  }
  return $value
}

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required restore tool is unavailable: $Name"
  }
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command exited with code $LASTEXITCODE"
  }
}

function Get-QueryRows {
  param(
    [Parameter(Mandatory)][string]$ConnectionString,
    [Parameter(Mandatory)][string]$Sql
  )

  $output = & psql $ConnectionString --tuples-only --no-align --set=ON_ERROR_STOP=1 --command=$Sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql query failed: $Sql"
  }
  return @($output | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

function Get-QueryScalar {
  param(
    [Parameter(Mandatory)][string]$ConnectionString,
    [Parameter(Mandatory)][string]$Sql
  )

  $rows = @(Get-QueryRows -ConnectionString $ConnectionString -Sql $Sql)
  if ($rows.Count -ne 1) {
    throw "Expected exactly one row from: $Sql"
  }
  return $rows[0]
}

$setId = Get-RequiredEnvironmentVariable "BACKUP_SET_ID"
$ageIdentity = Get-RequiredEnvironmentVariable "BACKUP_AGE_IDENTITY"
$r2ConfigValue = Get-RequiredEnvironmentVariable "R2_RCLONE_CONFIG"
$scratchDatabaseUrl = Get-RequiredEnvironmentVariable "SCRATCH_DB_URL"
$confirmation = Get-RequiredEnvironmentVariable "RESTORE_CONFIRMATION"

if ($confirmation -cne "RESTORE BACKUP TO SCRATCH") {
  throw "Set RESTORE_CONFIRMATION to RESTORE BACKUP TO SCRATCH"
}
if ($setId -notmatch '^weekly-[0-9]{8}T[0-9]{6}Z-[0-9]+-[0-9]+$') {
  throw "Invalid weekly backup set ID: $setId"
}
if (-not (Test-Path -LiteralPath $ageIdentity -PathType Leaf)) {
  throw "Offline age identity is not a readable file: $ageIdentity"
}

foreach ($command in @("age", "node", "rclone", "tar", "zstd", "pg_restore", "psql")) {
  Assert-Command $command
}

foreach ($binary in @("pg_restore", "psql")) {
  $major = (& $binary --version | Select-String -Pattern '[0-9]+' -AllMatches).Matches[0].Value
  if ($major -ne "17") {
    throw "Restore requires PostgreSQL 17 $binary; found major $major"
  }
}

$workRoot = if ($env:RESTORE_WORK_ROOT) { $env:RESTORE_WORK_ROOT } else { $env:TEMP }
$workDirectory = Join-Path $workRoot "katbose-restore-$([guid]::NewGuid().ToString('N'))"
$r2ConfigPath = Join-Path $workDirectory "r2-rclone.conf"
$remoteRoot = "r2:katbose-backups/weekly/$setId"
$encryptedArchive = Join-Path $workDirectory "$setId.tar.zst.age"
$completeMarker = Join-Path $workDirectory "complete.json"
$compressedArchive = Join-Path $workDirectory "$setId.tar.zst"
$tarArchive = Join-Path $workDirectory "$setId.tar"
$extractedSet = Join-Path $workDirectory "set"
$contractScript = Join-Path $PSScriptRoot "backup-set.mjs"

New-Item -ItemType Directory -Path $workDirectory, $extractedSet | Out-Null
try {
  [System.IO.File]::WriteAllText($r2ConfigPath, $r2ConfigValue)

  Invoke-NativeCommand "rclone" @(
    "--config", $r2ConfigPath, "--s3-no-check-bucket", "copyto",
    "$remoteRoot/complete.json", $completeMarker
  )
  Invoke-NativeCommand "rclone" @(
    "--config", $r2ConfigPath, "--s3-no-check-bucket", "copyto",
    "$remoteRoot/$setId.tar.zst.age", $encryptedArchive
  )
  Invoke-NativeCommand "node" @($contractScript, "verify-marker", $encryptedArchive, $completeMarker)

  Invoke-NativeCommand "age" @(
    "--decrypt", "--identity", $ageIdentity, "--output", $compressedArchive, $encryptedArchive
  )
  # zstd names its output with -o; there is no --output.
  Invoke-NativeCommand "zstd" @(
    "--decompress", "--quiet", "-o", $tarArchive, $compressedArchive
  )

  # Reject links, devices, absolute paths, traversal and Windows-invalid
  # names before extraction. The public age recipient is not an authority
  # boundary, so archive contents must remain inside this work directory.
  $archiveEntries = & tar --list --verbose --file=$tarArchive
  if ($LASTEXITCODE -ne 0) {
    throw "tar failed to inspect the decrypted archive"
  }
  foreach ($archiveEntry in $archiveEntries) {
    if ([string]::IsNullOrEmpty($archiveEntry) -or $archiveEntry[0] -notin @('-', 'd')) {
      throw "Unsafe non-file archive entry: $archiveEntry"
    }
  }

  $archivePaths = & tar --list --file=$tarArchive
  if ($LASTEXITCODE -ne 0) {
    throw "tar failed to list the decrypted archive"
  }
  $invalidWindowsFileNameCharacters = [System.IO.Path]::GetInvalidFileNameChars()
  foreach ($archivePath in $archivePaths) {
    $normalized = $archivePath -replace '^\./', ''
    $segments = $normalized -split '/'
    if (
      $normalized -match '\\' -or
      [System.IO.Path]::IsPathRooted($normalized) -or
      $segments -contains ".."
    ) {
      throw "Unsafe path in backup archive: $archivePath"
    }
    foreach ($segment in $segments) {
      if ([string]::IsNullOrEmpty($segment) -or $segment -eq ".") {
        continue
      }
      if (
        $segment.IndexOfAny($invalidWindowsFileNameCharacters) -ge 0 -or
        $segment -match '[. ]$' -or
        $segment -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$'
      ) {
        throw "Archive path is not portable to Windows: $archivePath"
      }
    }
  }

  Invoke-NativeCommand "tar" @(
    "--extract", "--file=$tarArchive", "--directory=$extractedSet"
  )
  Invoke-NativeCommand "node" @($contractScript, "verify-pair", $extractedSet, $completeMarker)

  $applicationDump = Join-Path $extractedSet "application.dump"
  Invoke-NativeCommand "pg_restore" @("--list", $applicationDump)

  $databaseStats = Get-Content -LiteralPath (Join-Path $extractedSet "database-tables.json") -Raw |
    ConvertFrom-Json
  $expectedTables = @($databaseStats.tables | ForEach-Object { $_.name } | Sort-Object)
  if ($expectedTables.Count -eq 0) {
    throw "Backup declares no application tables"
  }

  # Refuse a scratch database that already holds an application schema, so a
  # mistyped SCRATCH_DB_URL cannot overwrite real data. This mirrors the full
  # mode of restore-weekly-backup.sh and never uses --clean.
  $existingTables = Get-QueryScalar -ConnectionString $scratchDatabaseUrl -Sql @"
select count(*) from pg_catalog.pg_tables where schemaname = 'public';
"@
  if ($existingTables -ne "0") {
    throw "Restore requires an empty public schema in the scratch database; found $existingTables table(s)"
  }

  $compatibleRoles = Get-QueryScalar -ConnectionString $scratchDatabaseUrl -Sql @"
select count(*) from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role');
"@
  if ($compatibleRoles -ne "3") {
    throw "Full restore requires Supabase-compatible anon, authenticated and service_role roles"
  }

  Invoke-NativeCommand "pg_restore" @(
    "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges",
    "--dbname=$scratchDatabaseUrl", $applicationDump
  )

  $restoredTables = @(
    Get-QueryRows -ConnectionString $scratchDatabaseUrl -Sql @"
select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename;
"@
  )
  if (($restoredTables -join "`n") -ne ($expectedTables -join "`n")) {
    throw "Restored application table set differs from the backup manifest"
  }

  $restoredRows = 0
  foreach ($table in $databaseStats.tables) {
    if ($table.name -notmatch '^[a-z_][a-z0-9_]*$') {
      throw "Unsafe application table name in backup: $($table.name)"
    }
    $actualRows = Get-QueryScalar -ConnectionString $scratchDatabaseUrl -Sql @"
select count(*) from public."$($table.name)";
"@
    if ($actualRows -ne [string]$table.rows) {
      throw "Restored row count differs for public.$($table.name): expected $($table.rows), got $actualRows"
    }
    $restoredRows += [int]$actualRows
  }

  # Optional provider-loss exercise: when supplied, restore every archived
  # bucket through a destination Supabase S3 remote named `supabase`.
  if ($env:TARGET_STORAGE_RCLONE_CONFIG) {
    $targetConfigPath = Join-Path $workDirectory "target-storage-rclone.conf"
    [System.IO.File]::WriteAllText($targetConfigPath, $env:TARGET_STORAGE_RCLONE_CONFIG)
    $storageStats = Get-Content -LiteralPath (Join-Path $extractedSet "storage-buckets.json") -Raw |
      ConvertFrom-Json
    foreach ($bucket in $storageStats.buckets) {
      $source = Join-Path (Join-Path $extractedSet "storage") $bucket.name
      Invoke-NativeCommand "rclone" @(
        "--config", $targetConfigPath, "copy", $source, "supabase:$($bucket.name)",
        "--checkers", "8", "--metadata", "--transfers", "4"
      )
      Invoke-NativeCommand "rclone" @(
        "--config", $targetConfigPath, "check", $source, "supabase:$($bucket.name)",
        "--download", "--one-way"
      )
    }
  }
  else {
    Write-Output "Storage payload integrity passed; destination Storage restore skipped (TARGET_STORAGE_RCLONE_CONFIG not set)."
  }

  Write-Output "Restore drill passed for $setId ($($restoredTables.Count) tables, $restoredRows rows)."
}
finally {
  Remove-Item -LiteralPath $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
