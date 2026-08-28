#!/usr/bin/env node
/**
 * Runs the Phase 1 Lighthouse gate against the built OpenNext Worker.
 *
 * Thresholds live in `lighthouserc.json`, not here, so the gate is declarative.
 * This script exists only to own the preview server's lifecycle:
 *
 * - Lighthouse CI can start a server itself, but only by matching a readiness
 *   string in the server's log output. Polling the URL is deterministic instead
 *   of coupling the gate to Wrangler's console text.
 * - The server must be stopped on every exit path, including a failed audit, or
 *   CI leaves a process holding the port.
 *
 * Usage: `pnpm lighthouse` (which builds first).
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../", import.meta.url);
const CONFIG_PATH = new URL("lighthouserc.json", REPO_ROOT);

const READINESS_TIMEOUT_MS = 180_000;
const READINESS_INTERVAL_MS = 1_000;
const SHUTDOWN_GRACE_MS = 10_000;

/** Reads the first configured URL so the port cannot drift from the config. */
function resolveReadinessUrl() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const [firstUrl] = config?.ci?.collect?.url ?? [];
  if (typeof firstUrl !== "string") {
    throw new Error("lighthouserc.json does not declare ci.collect.url");
  }
  const { origin, port } = new URL(firstUrl);
  if (!port) throw new Error(`Configured URL must include a port: ${firstUrl}`);
  return { origin, port };
}

function spawnStep(command, args) {
  return spawn(command, args, {
    cwd: fileURLToPath(REPO_ROOT),
    stdio: "inherit",
    // pnpm resolves through a shell script on Windows.
    shell: process.platform === "win32",
  });
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(origin, { redirect: "manual" });
      // Any HTTP status means the Worker is listening and routing.
      if (response.status > 0) return;
    } catch {
      // Not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_INTERVAL_MS));
  }
  throw new Error(`Preview server was not reachable at ${origin} within ${READINESS_TIMEOUT_MS}ms`);
}

/** Runs one `lhci` stage, returning its exit code. */
async function runStage(stage, { tolerateFailure = false } = {}) {
  const child = spawnStep("pnpm", ["exec", "lhci", stage]);
  const [code] = await once(child, "exit");
  if (code !== 0 && !tolerateFailure) {
    throw new Error(`lhci ${stage} failed with exit code ${code}`);
  }
  return code;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), SHUTDOWN_GRACE_MS)),
  ]);
  if (!exited) child.kill("SIGKILL");
}

async function main() {
  const { origin, port } = resolveReadinessUrl();

  const server = spawnStep("pnpm", [
    "--filter",
    "web",
    "exec",
    "opennextjs-cloudflare",
    "preview",
    "--port",
    port,
  ]);

  try {
    await waitForServer(origin, server);
    // Deliberately not `lhci autorun`: that asserts before it uploads, so a
    // failed gate publishes no report and the failure cannot be diagnosed from
    // CI. Running the stages in order guarantees the reports exist whatever the
    // assertions decide.
    await runStage("collect");
    await runStage("upload");
    const assertCode = await runStage("assert", { tolerateFailure: true });
    if (assertCode !== 0) {
      throw new Error(`Lighthouse assertions failed with exit code ${assertCode}`);
    }
    process.stdout.write("Lighthouse gate passed. Reports are in .lighthouseci\n");
  } finally {
    await stopServer(server);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
