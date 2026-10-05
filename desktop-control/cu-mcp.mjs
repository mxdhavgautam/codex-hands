#!/usr/bin/env node
// Stdio MCP server that exposes Codex's bundled computer use (cua_repl) to any harness.
//
// Registered as the `codex-cu` MCP server in Claude Code, cursor-agent and opencode:
//   node ~/.claude/skills/desktop-control/cu-mcp.mjs
//
// It finds the newest unified-computer-use plugin the Codex app installed, launches its
// cua_repl server with the plugin's env, and proxies MCP messages both ways. cua_repl asks
// the client to approve every app and action through MCP form elicitation; most harnesses
// can't answer that headlessly, so this proxy accepts every request itself. It also tags tool
// calls with Codex-style thread and turn metadata, so the helper can unlock a locked Mac for them.
//
// Needs the Codex app installed (macOS: ChatGPT.app, Windows: Codex) but not running. On
// Windows it must be spawned from the interactive desktop session, not from SSH.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

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

const env = { ...process.env, ...server.env };
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
child.on("close", (code) => {
  endTurn();
  process.stdout.write("", () => process.exit(code ?? (clientClosed ? 0 : 1)));
});

// Non-JSON lines are passed through untouched rather than crashing the proxy.
const forward = (stream, line) => stream.write(`${line}\n`);

const send = (stream, message) => stream.write(`${JSON.stringify(message)}\n`);

// Codex tags every tool call with its thread and turn, and tells cua_repl and the computer use
// helper when a turn ends. The helper unlocks a locked Mac for a turn and locks it again at its end
// (told by turn-ended.mjs, under the bundled node, which it trusts); the browser side releases the
// turn's tabs (told through cua_repl's hidden turn_ended tool). This proxy ends a turn when:
// - the harness's Stop hook runs turn-end-hook.mjs, which connects to this session's control
//   socket (Claude Code; the precise signal);
// - no tool call has been in flight for TURN_IDLE_MS, for harnesses without a hook (off once a
//   hook has been seen; long, since it closes the turn's tabs);
// - cua_repl exits.
// The helper releases a thread's unlock without looking at the turn, so each turn gets its own
// thread id, "<session id>/<proxy pid>/<turn number>": a late turn end can't release the next
// turn's unlock, and two proxies for one session can't release each other's.
const TURN_IDLE_MS = 900_000;
const turnEndedScript = join(dirname(fileURLToPath(import.meta.url)), "turn-ended.mjs");
const bundledNode = env.NODE_REPL_NODE_PATH ?? server.command;
// Claude Code gives MCP servers its session id, so the records point at the real session and its
// Stop hook can find this proxy. cursor-agent and opencode expose none, so they get a random one.
const harnessSessionId = process.env.CLAUDE_CODE_SESSION_ID;
const sessionId = harnessSessionId || randomUUID();
let turnNumber = 1;
let threadId = `${sessionId}/${process.pid}/${turnNumber}`;
let turnId = randomUUID();
let turnActive = false;
let turnTimer;
let hookSeen = false;
let endAfterCalls = false;
const pendingCleanups = new Set();
let drainWaiters = []; // resolved when no tool call is in flight
const callsInFlight = new Set();
// Internal request id -> resolver, for the proxy's own turn_ended calls (hidden from the client).
const internalCalls = new Map();

// Returns a promise that settles once cua_repl has handled turn_ended (or right away if it can't).
const endTurn = () => {
  if (!turnActive) return Promise.resolve();
  turnActive = false;
  endAfterCalls = false;
  clearTimeout(turnTimer);
  let browserCleanup = Promise.resolve();
  if (child.exitCode === null && child.signalCode === null && child.stdin.writable) {
    const id = `codex-cu-turn-ended-${randomUUID()}`;
    browserCleanup = new Promise((resolve) => internalCalls.set(id, resolve));
    pendingCleanups.add(browserCleanup);
    browserCleanup.then(() => pendingCleanups.delete(browserCleanup));
    const args = { hook_event_name: "Stop", session_id: threadId, turn_id: turnId };
    send(child.stdin, { jsonrpc: "2.0", id, method: "tools/call", params: { name: "turn_ended", arguments: args } });
  }
  if (process.platform === "darwin" && existsSync(turnEndedScript)) {
    // Detached so it still reaches the helper when the proxy is exiting.
    spawn(bundledNode, [turnEndedScript, threadId, turnId], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  }
  threadId = `${sessionId}/${process.pid}/${++turnNumber}`;
  turnId = randomUUID();
  return browserCleanup;
};

// The idle clock only runs while no tool call is in flight, so a long call never loses its unlock.
// A cancelled call stays in flight until cua_repl answers it, since it may still be running.
const callStarted = (id) => {
  turnActive = true;
  clearTimeout(turnTimer);
  if (id != null) callsInFlight.add(id);
};
const callFinished = (id) => {
  if (!callsInFlight.delete(id) || callsInFlight.size > 0) return;
  for (const resolve of drainWaiters) resolve();
  drainWaiters = [];
  if (endAfterCalls) return endTurn();
  clearTimeout(turnTimer);
  if (!hookSeen) turnTimer = setTimeout(endTurn, TURN_IDLE_MS);
};
const hookTurnEnded = () => {
  hookSeen = true;
  clearTimeout(turnTimer);
  if (callsInFlight.size > 0) endAfterCalls = true;
  else endTurn();
};

// The Stop hook finds this proxy by the harness session id: turn-end-hook.mjs signals every
// "codex-cu-<hash>-<pid>" socket (or Windows pipe) for its session, so two processes sharing a
// session each keep their own.
if (harnessSessionId) {
  const hash = createHash("sha256").update(harnessSessionId).digest("hex").slice(0, 16);
  const name = `codex-cu-${hash}-${process.pid}`;
  const controlPath = process.platform === "win32" ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
  if (process.platform !== "win32") rmSync(controlPath, { force: true });
  const control = createServer((socket) => socket.on("data", (data) => {
    if (data.toString().includes("turn-ended")) hookTurnEnded();
    socket.end();
  }));
  control.on("error", () => {});
  control.listen(controlPath);
  control.unref();
  if (process.platform !== "win32") process.on("exit", () => rmSync(controlPath, { force: true }));
}

// The proxy's own ids always win, so the turn it ends is the turn the helper saw.
const withTurnMetadata = (params) => {
  const turn = JSON.stringify({ session_id: threadId, turn_id: turnId });
  return { ...params, _meta: { ...params?._meta, "x-codex-turn-metadata": turn } };
};

// On disconnect or a stop signal, end the turn while cua_repl can still release its tabs, then end
// the child's stdin so it finishes and exits, which exits the proxy; kill it if it hangs. With calls
// still in flight, the turn ends once they finish (within the same 5 s).
function shutDown() {
  if (clientClosed) return;
  clientClosed = true;
  const cleanup = (async () => {
    while (callsInFlight.size > 0) await new Promise((resolve) => drainWaiters.push(resolve));
    endTurn();
    await Promise.all(pendingCleanups);
  })();
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000).unref());
  Promise.race([cleanup, timeout]).then(() => {
    child.stdin.end();
    setTimeout(() => child.kill(), 5000).unref();
  });
}
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, shutDown);

// Client -> server: advertise form elicitation so cua_repl asks instead of refusing, and add
// turn metadata to tool calls.
createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const message = parseJson(line);
  if (message?.method === "initialize") {
    const capabilities = { ...message.params?.capabilities, elicitation: { form: {} } };
    return send(child.stdin, { ...message, params: { ...message.params, capabilities } });
  }
  if (message?.method === "tools/call") {
    callStarted(message.id);
    return send(child.stdin, { ...message, params: withTurnMetadata(message.params) });
  }
  forward(child.stdin, line);
}).on("close", shutDown);

// Server -> client: answer approval requests here, pass everything else through.
createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  const message = parseJson(line);
  if (message?.method === "elicitation/create" && message.id != null) {
    send(child.stdin, { jsonrpc: "2.0", id: message.id, result: { action: "accept", content: {} } });
    return;
  }
  if (internalCalls.has(message?.id)) {
    internalCalls.get(message.id)();
    internalCalls.delete(message.id);
    return;
  }
  if (message?.id != null && message.method === undefined) callFinished(message.id);
  forward(process.stdout, line);
});
