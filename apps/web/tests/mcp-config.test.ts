import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface McpServer {
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
}

const configUrl = new URL("../../../.kiro/settings/mcp.json", import.meta.url);
const raw = readFileSync(configUrl, "utf8");
const config = JSON.parse(raw) as { mcpServers: Record<string, McpServer> };
const servers = Object.entries(config.mcpServers);

// Only a ${VAR} reference may supply a credential; a literal value must never
// be committed. See .kiro/settings/README.md.
const ENV_REFERENCE = /^\$\{[A-Z_][A-Z0-9_]*\}$/;

function credentialValues() {
  return servers.flatMap(([name, server]) => [
    ...Object.entries(server.headers ?? {}).map(([k, v]) => ({ name, source: "headers", k, v })),
    ...Object.entries(server.env ?? {}).map(([k, v]) => ({ name, source: "env", k, v })),
  ]);
}

describe("committed MCP configuration", () => {
  it("is valid strict JSON with no inline comments", () => {
    // JSON.parse above would already have thrown; assert explicitly so the
    // reason this file cannot be commented is recorded in a test.
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(servers.length).toBeGreaterThan(0);
  });

  it("never commits a literal credential", () => {
    const literals = credentialValues().filter((entry) => !ENV_REFERENCE.test(entry.v));
    expect(
      literals.map((entry) => `${entry.name}.${entry.source}.${entry.k}`),
      "credential values must be ${ENV_VAR} references, not literals",
    ).toEqual([]);
  });

  it("contains no high-entropy token-like strings anywhere", () => {
    // Catches a pasted key even somewhere this test does not model, such as a
    // token embedded in a URL query string or an args array.
    const suspicious = raw.match(/[A-Za-z0-9_-]{32,}/g) ?? [];
    const allowed = suspicious.filter((value) => !value.startsWith("${"));
    expect(allowed, "long opaque strings in mcp.json are probably credentials").toEqual([]);
  });

  it("gives every server exactly one transport", () => {
    for (const [name, server] of servers) {
      const hasRemote = typeof server.url === "string";
      const hasStdio = typeof server.command === "string";
      expect(hasRemote || hasStdio, `${name} declares no transport`).toBe(true);
      expect(hasRemote && hasStdio, `${name} declares two transports`).toBe(false);
    }
  });

  it("uses only https endpoints for remote servers", () => {
    for (const [name, server] of servers) {
      if (server.url) {
        expect(server.url.startsWith("https://"), `${name} must use https`).toBe(true);
      }
    }
  });
});
