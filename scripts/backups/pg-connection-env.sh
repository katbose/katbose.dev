#!/usr/bin/env bash
# shellcheck shell=bash
#
# Sourced by create-weekly-backup.sh and restore-weekly-backup.sh; not run
# directly.
#
# libpq expands a connection URI only when it is supplied as the dbname
# *parameter*. PGDATABASE taken from the environment is a literal database name
# (https://www.postgresql.org/docs/17/libpq-envars.html), so exporting a URI
# there makes pg_dump, pg_restore and psql ignore the host entirely and fall
# back to the default local socket. Decomposing the URI into individual libpq
# variables connects correctly while still keeping the password out of argv,
# and therefore out of `ps` output.

export_pg_environment() {
  local url="$1"
  local -a settings=()

  mapfile -d '' -t settings < <(
    PG_CONNECTION_URL="$url" node --input-type=module - <<'NODE'
const url = new URL(process.env.PG_CONNECTION_URL);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const user = decodeURIComponent(url.username);
const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";

if (!url.hostname || !user) {
  process.stderr.write("PostgreSQL connection URL is missing a host or user\n");
  process.exit(1);
}

// Default to require off loopback so a backup can never stream an entire
// database over an unencrypted connection just because the URL omitted it.
const sslmode =
  url.searchParams.get("sslmode") ||
  (LOOPBACK_HOSTS.has(url.hostname) ? "disable" : "require");

const fields = [
  url.hostname,
  url.port || "5432",
  user,
  decodeURIComponent(url.password),
  database,
  sslmode,
];
process.stdout.write(fields.map((field) => `${field}\0`).join(""));
NODE
  )

  if [[ "${#settings[@]}" -ne 6 ]]; then
    echo "Could not parse the PostgreSQL connection URL" >&2
    exit 1
  fi

  export PGHOST="${settings[0]}"
  export PGPORT="${settings[1]}"
  export PGUSER="${settings[2]}"
  export PGPASSWORD="${settings[3]}"
  export PGDATABASE="${settings[4]}"
  export PGSSLMODE="${settings[5]}"
}
