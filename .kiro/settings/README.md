# MCP configuration

`mcp.json` registers the Model Context Protocol servers used while developing this project. It is
committed deliberately: the tooling an agent is given is part of how this repository is built, and
it should be reviewable like any other configuration.

It is plain `.json`, so it cannot carry inline comments — JSON has no comment syntax and adding
JSONC-style `//` breaks `JSON.parse`. That is why this file exists.

---

## Registered servers

All five are Cloudflare's official managed remote servers, configured per
[Cloudflare's agent setup guide](https://developers.cloudflare.com/agent-setup/prompt.md).

| Server | Endpoint | Used for |
| --- | --- | --- |
| `cloudflare-api` | `mcp.cloudflare.com` | The whole Cloudflare API — DNS, R2, Workers, Turnstile — via `search()` and `execute()` |
| `cloudflare-bindings` | `bindings.mcp.cloudflare.com` | R2 buckets, KV, D1, Workers |
| `cloudflare-builds` | `builds.mcp.cloudflare.com` | Workers Builds status and logs |
| `cloudflare-observability` | `observability.mcp.cloudflare.com` | Worker logs and analytics |
| `cloudflare-docs` | `docs.mcp.cloudflare.com` | Current Cloudflare documentation (public, no auth) |

`cloudflare-api` uses the search-and-execute Code Mode pattern: roughly 1,000 tokens of context for
~2,500 endpoints, where exposing each endpoint as its own tool would cost over a million.

---

## Why there are no secrets in this file

Every server here authenticates with **OAuth on first tool use**. Tokens are written to
`~/.mcp-auth/`, outside the repository. No API key, token or account identifier appears in
`mcp.json`, which is what makes it safe to commit.

Use the native `url` form rather than the `mcp-remote` stdio bridge. The bridge hardcodes the OIDC
scopes `openid email profile`, and `mcp.cloudflare.com` advertises no `scopes_supported` at all, so
it rejects them with `invalid_scope`. Cloudflare's own guidance for non-Claude agents is bare `url`.

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
or `env` value in `mcp.json` is anything other than a `${VAR}` reference.

---

## Approval policy

`autoApprove` lists tools that run without a per-call prompt. The entries here are read-only
discovery and listing calls, plus `execute` on `cloudflare-api`, which the repository owner
explicitly opted into.

`execute` can perform any Cloudflare API mutation on the account. Auto-approval removes the prompt,
not the judgement: destructive or production-affecting operations — deleting DNS records, changing
security configuration, applying migrations — should still be confirmed with the owner first.

---

## Setup

1. Open the **MCP Server** view in the Kiro feature panel
2. Connect each server; a browser opens for Cloudflare OAuth on first use
3. `cloudflare-docs` is public and needs no authorization

Some Cloudflare features need a one-time account opt-in before the API will accept calls — R2, for
example, returns `10042: Please enable R2 through the Cloudflare Dashboard` until enabled in the
dashboard. That is an account setting, not an MCP problem.
