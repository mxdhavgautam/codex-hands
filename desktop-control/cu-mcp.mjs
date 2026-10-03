#!/usr/bin/env node
// Stdio MCP server that exposes Codex's bundled computer use (cua_repl) to any harness.
//
// Registered as the `codex-cu` MCP server in Claude Code, cursor-agent and opencode:
//   node ~/.claude/skills/desktop-control/cu-mcp.mjs
//
// It finds the newest unified-computer-use plugin the Codex app installed, launches its
// cua_repl server with the plugin's env, and proxies MCP messages both ways. cua_repl asks
// the client to approve every app and action through MCP form elicitation; most harnesses
// can't answer that headlessly, so this proxy accepts every request itself.
//
// Needs the Codex app installed (macOS: ChatGPT.app, Windows: Codex) but not running. On
// Windows it must be spawned from the interactive desktop session, not from SSH.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";

const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const pluginRoot = join(codexHome, "plugins", "cache", "openai-bundled", "unified-computer-use");

const fail = (message) => {
  process.stderr.write(`codex-cu: ${message}\n`);
  process.exit(1);
};

const compareVersions = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

if (!existsSync(pluginRoot)) fail(`no Codex computer use plugin at ${pluginRoot}; install and open the Codex app once`);
const version = readdirSync(pluginRoot)
  .filter((name) => /^\d+(\.\d+)*$/.test(name) && existsSync(join(pluginRoot, name, ".mcp.json")))
  .sort(compareVersions)
  .at(-1);
if (!version) fail(`no .mcp.json under ${pluginRoot}`);

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const server = parseJson(readFileSync(join(pluginRoot, version, ".mcp.json"), "utf8"))?.mcpServers?.cua_repl;
if (!server) fail(`cua_repl missing from ${version}/.mcp.json`);

const env = { ...process.env, ...server.env, CUA_REPL_ENABLED_SURFACES: "computer" };
if (process.platform === "win32") {
  // The Windows plugin talks to a pipe owned by the running Codex app and sandboxes the
  // kernel through the Codex CLI, which fails outside the app. Without these, sky spawns its
  // own helper and the kernel runs unsandboxed (on macOS it stays in the Codex sandbox).
  // The helper still runs `codex app-server`, so the app's bundled CLI goes on PATH instead.
  delete env.SKY_CUA_NATIVE_PIPE;
  delete env.SKY_CUA_NATIVE_PIPE_DIRECTORY;
  if (env.CODEX_CLI_PATH) env.PATH = `${dirname(env.CODEX_CLI_PATH)}${delimiter}${env.PATH ?? ""}`;
  delete env.CODEX_CLI_PATH;
  const services = JSON.parse(env.NODE_REPL_TRUSTED_SERVICES || "{}");
  env.NODE_REPL_TRUSTED_SERVICES = JSON.stringify({ ...services, sky: "@oai/sky/service" });
}

const child = spawn(server.command, server.args ?? [], { env, stdio: ["pipe", "pipe", "inherit"] });
child.on("error", (error) => fail(`could not start cua_repl: ${error.message}`));
// "close" fires after the child's stdout is fully read; flush ours before exiting.
// A signal death (code null) is a failure unless we killed it because the client left.
let clientClosed = false;
child.on("close", (code) => process.stdout.write("", () => process.exit(code ?? (clientClosed ? 0 : 1))));

// Non-JSON lines are passed through untouched rather than crashing the proxy.
const forward = (stream, line) => stream.write(`${line}\n`);

const send = (stream, message) => stream.write(`${JSON.stringify(message)}\n`);

// Client -> server: advertise form elicitation so cua_repl asks instead of refusing.
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const message = parseJson(line);
  if (message?.method !== "initialize") return forward(child.stdin, line);
  const capabilities = { ...message.params?.capabilities, elicitation: { form: {} } };
  send(child.stdin, { ...message, params: { ...message.params, capabilities } });
}).on("close", () => {
  // End the child's stdin so it finishes in-flight replies and exits; kill it if it hangs.
  clientClosed = true;
  child.stdin.end();
  setTimeout(() => child.kill(), 5000).unref();
});

// Server -> client: answer approval requests here, pass everything else through.
createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  const message = parseJson(line);
  if (message?.method === "elicitation/create" && message.id != null) {
    send(child.stdin, { jsonrpc: "2.0", id: message.id, result: { action: "accept", content: {} } });
    return;
  }
  forward(process.stdout, line);
});
