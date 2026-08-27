# Naming conventions

Normative rule. Recorded as decision #93 in [16-decision-log.md](../../docs/16-decision-log.md) §16.24.

## The owner's name

Always one token, never a space. Exactly three casings:

| Form | Use for | Example |
| --- | --- | --- |
| `katbose` | identifiers, package names, handles, hostnames, slugs | `katbose`, `github.com/katbose` |
| `KatBose` | display text and prose | `KatBose — Software Engineer` |
| `KATBOSE` | constants and env-var prefixes | `KATBOSE_API_KEY` |

Never write `Kat Bose`, `Kat_Bose`, `kat-bose`, or a bare `Kat`. In prose the person is
`KatBose`, including possessives (`KatBose's portfolio`).

`SITE_IDENTITY.name` in `packages/shared/src/site.ts` is the single runtime source for the display
form. Do not hardcode the display name anywhere it could read that constant instead.

The one deliberate exception is `packages/katbose-card`, a dependency-free build-time snapshot that
repeats the literal. `apps/web/tests/katbose-card.test.ts` fails if it drifts from `SITE_IDENTITY`,
so the two must be edited together.

## Resource identifiers

Pattern: `katbose-<thing>`, lowercase, hyphen-separated.

| Resource | Identifier |
| --- | --- |
| Monorepo project | `katbose-portfolio` |
| Database | `katbose-db` |
| Cache / queue | `katbose-redis` |
| Public Worker | `katbose-web` |
| CMS service | `katbose-cms` |
| Alerts channel | `katbose-alerts` |
| Backup bucket | `katbose-backups` |

## When a hyphen is illegal

Substitute an underscore and keep everything else identical: `katbose_portfolio`, `katbose_db`,
`katbose_redis`.

This applies to Postgres unquoted identifiers (databases, schemas, roles, tables), environment
variable names, and identifiers in TypeScript, SQL and shell. Prefer the hyphen form wherever the
target actually accepts it — Slack channels, npm and workspace package names, Cloudflare Workers and
R2 buckets, Render services, GitHub repositories, and DNS labels all do.
