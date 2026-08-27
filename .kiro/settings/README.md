# MCP configuration

`mcp.json` registers the Model Context Protocol servers used while developing this project. It is
committed deliberately: the tooling an agent is given is part of how this repository is built, and
it should be reviewable like any other configuration.

It is plain `.json`, so it cannot carry inline comments — JSON has no comment syntax and adding
JSONC-style `//` breaks `JSON.parse`. That is why this file exists.

---

## Registered servers

The workspace uses managed remote servers for vendor APIs and pinned local stdio servers for browser
inspection. Exact local package versions prevent an MCP update from silently changing the available
tools during a review.

| Server | Transport | Used for |
| --- | --- | --- |
| `cloudflare-api` | `https://mcp.cloudflare.com/mcp` | Cloudflare API — DNS, R2, Workers and Turnstile through `search()` and `execute()` |
| `cloudflare-bindings` | `https://bindings.mcp.cloudflare.com/mcp` | R2, KV, D1 and Worker bindings |
| `cloudflare-builds` | `https://builds.mcp.cloudflare.com/mcp` | Workers Builds status and logs |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | Worker logs and analytics |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | Current Cloudflare documentation; public, no auth |
| `github` | `https://api.githubcopilot.com/mcp/` | Repository, pull request, Actions and environment administration through GitHub's official hosted MCP server |
| `chrome-devtools` | `chrome-devtools-mcp@1.8.0` | Chrome traces, Core Web Vitals, network inspection and accessibility snapshots |
| `playwright` | `@playwright/mcp@0.0.79` | Headless browser navigation and accessibility-tree automation |
| `posthog` | `https://mcp.posthog.com/mcp` | Product analytics, web vitals and production event verification |

The Cloudflare endpoints follow
[Cloudflare's agent setup guide](https://developers.cloudflare.com/agent-setup/prompt.md). GitHub's
hosted endpoint is the recommended server for most users in the
[official GitHub MCP setup guide](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server).
The local browser packages follow the official
[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) and
[Playwright MCP](https://github.com/microsoft/playwright-mcp) projects. Versions were resolved from
the npm registry and command-line help was smoke-tested on Windows on 2026-08-27.

`cloudflare-api` uses the search-and-execute Code Mode pattern: roughly 1,000 tokens of context for
~2,500 endpoints, where exposing each endpoint as its own tool would cost over a million.

The browser servers deliberately use isolated profiles, so authenticated cookies and browsing state
are not persisted between MCP sessions. Chrome usage telemetry and CrUX URL lookups are disabled,
and network headers are redacted before tool responses. Playwright runs headless against the locally
installed stable Chrome channel. Only the read-only session-discovery tools are auto-approved; browser actions can submit forms or mutate authenticated web applications, so all other tools remain supervised.

---

## Why there are no secrets in this file

The Cloudflare and PostHog managed servers authenticate with OAuth on first tool use. Their tokens
are written outside the repository by the MCP client. The local browser servers need no credential.
GitHub's hosted MCP server requires a fine-grained personal access token from the user environment;
the committed header contains only `${GITHUB_PERSONAL_ACCESS_TOKEN}`. No API key, token or account
identifier appears in `mcp.json`, which is what makes it safe to commit.

Use the native `url` form for managed servers rather than the `mcp-remote` stdio bridge. The bridge
hardcodes the OIDC scopes `openid email profile`, and `mcp.cloudflare.com` advertises no
`scopes_supported` at all, so it rejects them with `invalid_scope`. Cloudflare's own guidance for
non-Claude agents is bare `url`.

---

## If a server ever needs a credential

Some MCP servers authenticate with a header or environment variable instead of OAuth. **Never write
the value into this file.** Reference an environment variable and let the shell supply it:

```json
{
  "mcpServers": {
    "example-service": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${EXAMPLE_API_TOKEN}" }
    },
    "example-stdio-service": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": { "EXAMPLE_API_TOKEN": "${EXAMPLE_API_TOKEN}" }
    }
  }
}
```

Set `EXAMPLE_API_TOKEN` as a user environment variable on your machine. The committed file then
records *which* credential is required without ever containing it — the same discipline
`apps/web/.env.example` applies to application secrets.

If a server's credential genuinely cannot be supplied by environment variable, put that server in
the user-level config at `~/.kiro/settings/mcp.json` instead, which is outside the repository. Note
that workspace configuration takes precedence over user configuration, so a server defined in both
places resolves to the workspace entry — including a `"disabled": true` there overriding a working
user-level definition.

This is enforced, not merely requested: `apps/web/tests/mcp-config.test.ts` fails if any `headers`
or `env` credential is not a `${VAR}` reference, optionally prefixed by the standard static
`Bearer ` authorization scheme.

---

## Approval policy

`autoApprove` lists tools that run without a per-call prompt. Cloudflare discovery/list calls are
read-only. `execute` on `cloudflare-api` and `exec` on `posthog` were explicitly opted into by the
repository owner, but both can dispatch mutations. Auto-approval removes the prompt, not the
judgement: destructive or production-affecting operations — deleting DNS records, changing security
configuration, editing analytics entities or applying migrations — still require owner confirmation.

GitHub intentionally has an empty approval list. The only browser auto-approvals are the read-only
session discovery calls `list_pages` and `browser_tabs`, recorded by Kiro during the smoke test.
Navigation, script execution, clicks, form submission and every other browser action remain
supervised even after the MCP connections succeed.

---

## Setup

1. Open the **MCP Server** view in the Kiro feature panel. Configuration changes reconnect
   automatically; if a server remains stale, reconnect it from that view.
2. Connect the Cloudflare and PostHog servers. A browser opens for OAuth on first use;
   `cloudflare-docs` is public and needs no authorization.
3. Create a **fine-grained** GitHub personal access token restricted to the `katbose/katbose.dev`
   repository. Grant only the repository permissions needed for the intended work: Contents and Pull
   requests for code review/merge, Actions for workflow runs, and Administration for environments.
   Store it in the Windows user environment as `GITHUB_PERSONAL_ACCESS_TOKEN` using the Environment
   Variables UI; do not paste it into chat, this file, a terminal command, or `.env.local`. Restart
   Kiro so the MCP process inherits it, then connect `github`.
4. Connect `chrome-devtools` and `playwright`. Their first start downloads the exact npm packages
   through `npx`; both then launch isolated Chrome profiles. Chrome stable must be installed. The
   packages themselves do not install browser binaries.

GitHub's API and MCP server can create the `production` environment and configure a secret from a
value supplied locally, but GitHub never returns secret values after storage. Likewise, the Supabase
Kiro Power can inspect project metadata, migrations and tables, but it deliberately does not expose
the database password or service-role key. `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT` and
`R2_RCLONE_CONFIG` therefore still need to be supplied through a trusted local secret source before
the backup-first production workflow can run.

Some Cloudflare features need a one-time account opt-in before the API will accept calls — R2, for
example, returns `10042: Please enable R2 through the Cloudflare Dashboard` until enabled in the
dashboard. That is an account setting, not an MCP problem.
