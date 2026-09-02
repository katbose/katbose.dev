#!/usr/bin/env node
// One-shot sync: read MCP servers from .kiro/settings/mcp.json and rewrite
// the project-level mirrors for Claude Code (.mcp.json),
// Cursor (.cursor/mcp.json), and OpenCode (opencode.json).
// VS Code (.vscode/mcp.json) is gitignored — regenerate it locally with
// `node scripts/sync-mcp.mjs --vscode` after a `git pull`.
//
// Usage:
//   node scripts/sync-mcp.mjs           # sync the three committed files
//   node scripts/sync-mcp.mjs --vscode  # also write .vscode/mcp.json
//   node scripts/sync-mcp.mjs --check   # exit 1 if any mirror is out of date
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ROOT = process.cwd();
const SOURCE = ".kiro/settings/mcp.json";

const kiro = JSON.parse(readFileSync(`${ROOT}/${SOURCE}`, "utf8"));
const servers = kiro.mcpServers ?? {};

const claudeShape = (s) => ({
  mcpServers: Object.fromEntries(
    Object.entries(s).map(([n, c]) => [n, { ...c, type: c.type ?? (c.url ? "http" : "stdio") }]),
  ),
});
// Cursor's mcpServers schema matches Kiro's exactly, disabled/autoApprove included.
const cursorShape = (s) => ({ mcpServers: { ...s } });
// OpenCode: top-level `mcp` block, each entry has `type: "remote" | "local"`.
const opencodeShape = (s) => ({
  $schema: "https://opencode.ai/config.json",
  mcp: Object.fromEntries(
    Object.entries(s).map(([n, c]) => [
      n,
      c.url
        ? { type: "remote", url: c.url, headers: c.headers, enabled: true }
        : { type: "local", command: [c.command, ...(c.args ?? [])], enabled: true },
    ]),
  ),
});
// VS Code Copilot uses `servers` (plural) and ${env:VAR} env-var syntax.
// disabled/autoApprove are Kiro-only fields with no equivalent in VS Code's
// mcp.json schema; leaving them in trips 2 "property not allowed" problems
// per server (24 for a 12-server config), so strip them here only.
const VSCODE_STRIP = new Set(["disabled", "autoApprove"]);
const vscodeShape = (s) => ({
  servers: Object.fromEntries(
    Object.entries(s).map(([n, c]) => {
      const vsc = { ...c };
      for (const key of VSCODE_STRIP) delete vsc[key];
      if (vsc.headers?.Authorization) {
        vsc.headers = {
          ...vsc.headers,
          Authorization: vsc.headers.Authorization.replace(/\$\{([A-Z_]+)\}/g, "${env:$1}"),
        };
      }
      return [n, vsc];
    }),
  ),
});

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${path}`);
}

const targets = [
  [".mcp.json", claudeShape(servers)],
  [".cursor/mcp.json", cursorShape(servers)],
  ["opencode.json", opencodeShape(servers)],
];
if (process.argv.includes("--vscode")) {
  targets.push([".vscode/mcp.json", vscodeShape(servers)]);
}
if (process.argv.includes("--check")) {
  let drift = false;
  for (const [path, expected] of targets) {
    const full = `${ROOT}/${path}`;
    if (
      !existsSync(full) ||
      readFileSync(full, "utf8").replace(/\r\n/g, "\n") !== JSON.stringify(expected, null, 2) + "\n"
    ) {
      console.error(`drift: ${path} is out of date — run \`node scripts/sync-mcp.mjs\``);
      drift = true;
    }
  }
  process.exit(drift ? 1 : 0);
}

for (const [path, data] of targets) writeJson(`${ROOT}/${path}`, data);
console.log(`synced ${Object.keys(servers).length} server(s) from ${SOURCE}`);
