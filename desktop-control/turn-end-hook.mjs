// Stop hook: tells this session's codex-cu proxy that the agent's turn ended, so it releases the
// turn's browser tabs and lets a Mac it unlocked lock again. Only that session's proxy is told.
//
// Claude Code (in settings.json, under hooks.Stop):
//   node ~/.claude/skills/desktop-control/turn-end-hook.mjs
// It reads the hook's JSON from stdin and uses its session_id, the same id the proxy got from
// CLAUDE_CODE_SESSION_ID, and signals every proxy for that session. It always exits 0, so a missing
// proxy never blocks the harness.

import { createHash } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Signals one proxy's control socket; removes a stale socket file left by a proxy that died.
const signal = (path) =>
  new Promise((resolve) => {
    const socket = createConnection(path, () => socket.end("turn-ended\n"));
    socket.on("error", (error) => {
      if (error.code === "ECONNREFUSED" && process.platform !== "win32") rmSync(path, { force: true });
      resolve();
    });
    socket.on("close", resolve);
  });

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  setTimeout(() => process.exit(0), 2000).unref();
  let sessionId;
  try {
    sessionId = JSON.parse(input).session_id;
  } catch {}
  if (typeof sessionId !== "string" || !sessionId) process.exit(0);
  // Each proxy for this session listens on codex-cu-<hash>-<pid>.
  const prefix = `codex-cu-${createHash("sha256").update(sessionId).digest("hex").slice(0, 16)}-`;
  const dir = process.platform === "win32" ? "\\\\.\\pipe\\" : tmpdir();
  let names = [];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith(prefix));
  } catch {}
  await Promise.all(names.map((name) => signal(process.platform === "win32" ? dir + name : join(dir, name))));
  process.exit(0);
});
