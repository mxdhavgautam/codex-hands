// Tells the Codex computer use helper (macOS) that a turn ended, so it can lock the Mac again if it
// unlocked it for that thread. cu-mcp.mjs runs it with the Codex app's bundled node:
//   <bundled node> turn-ended.mjs <thread id> <turn id>
//
// The helper only answers a socket client whose parent process is signed by OpenAI, and the
// bundled node is. So the first run starts a second copy of itself under the same node, and that
// copy sends ComputerUseIPCCodexTurnEndedRequest over the helper's socket (4-byte little-endian
// length, then a JSON-RPC message), the request Codex's own turn-end hook leads to.

import { spawn } from "node:child_process";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [threadID, turnID] = process.argv.slice(2);
if (!threadID || !turnID) throw new Error("usage: turn-ended.mjs <thread id> <turn id>");

if (process.env.CODEX_CU_TURN_ENDED_SENDER !== "1") {
  const env = { ...process.env, CODEX_CU_TURN_ENDED_SENDER: "1" };
  spawn(process.execPath, [fileURLToPath(import.meta.url), threadID, turnID], { env, stdio: "inherit" })
    .on("close", (code) => process.exit(code ?? 1));
} else {
  const timeoutMs = 10_000;
  const socketPath = join(homedir(), "Library", "Group Containers", "2DC432GLL2.com.openai.sky.CUAService", "IPC", "computeruse.sock");
  const message = {
    jsonrpc: "2.0",
    id: 1,
    method: "request",
    params: {
      clientApiVersion: "CodexComputerUseIPC-5",
      requestType: "ComputerUseIPCCodexTurnEndedRequest",
      request: { threadID, turnID },
      codexTurnMetadata: { session_id: threadID, turn_id: turnID },
      deadlineUnixMilliseconds: Date.now() + timeoutMs,
    },
  };

  const socket = net.createConnection(socketPath);
  const fail = (error) => {
    process.stderr.write(`codex-cu turn-ended: ${error.message}\n`);
    process.exit(1);
  };
  setTimeout(() => fail(new Error("timed out")), timeoutMs).unref();
  let buffer = Buffer.alloc(0);
  socket.once("connect", () => {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    socket.write(Buffer.concat([header, body]));
  });
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32LE(0)) return;
    const reply = JSON.parse(buffer.subarray(4, 4 + buffer.readUInt32LE(0)).toString("utf8"));
    if (reply?.id !== message.id || !("result" in reply)) fail(new Error(`helper replied ${JSON.stringify(reply?.error ?? reply)}`));
    socket.destroy();
    process.exit(0);
  });
  socket.once("error", fail);
  socket.once("close", () => fail(new Error("helper closed the connection without replying")));
}
