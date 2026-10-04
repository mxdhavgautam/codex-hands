# desktop-control: Codex computer use for any agent

This folder gives Claude Code, Cursor's `cursor-agent` and opencode the same computer use that Codex has, on macOS and Windows. It contains:

- `cu-mcp.mjs`: an MCP server (`codex-cu`) that runs the computer use engine the Codex app installs.
- `SKILL.md`: tells agents when and how to use it.
- `README.md`: this file, for setup and debugging.

Codex itself already has computer use built in and needs nothing from here.

## Requirements

- **macOS or Windows**, with you signed in at the desktop. Linux isn't supported.
- **The Codex app installed, with Computer Use working in it once.** On macOS that's the ChatGPT app; on Windows it's the Codex app from the Microsoft Store. Open it, ask Codex to do something with Computer Use (for example "use Calculator to work out 2 + 2"), and accept any prompts. On macOS this includes granting Accessibility and Screen Recording to "Codex Computer Use". That one run downloads the engine and grants the permissions this setup reuses. Afterwards the app doesn't need to be running.
- **Node.js 18 or newer** on `PATH` (`node --version`).
- **A strong model that can see images** in the harness you use (Claude, GPT-5 class and similar). Some apps can only be read from screenshots, Calculator on Windows among them. A text-only model can't read the result there and tends to loop: opencode on GPT-4.1 relaunched Calculator five times trying.

To check the first two, list the plugin folder; it should hold a version folder such as `26.930.31730`:
- macOS: `ls ~/.codex/plugins/cache/openai-bundled/unified-computer-use/`
- Windows: `Get-ChildItem "$HOME\.codex\plugins\cache\openai-bundled\unified-computer-use"`

On macOS, System Settings > Privacy & Security > Accessibility and Screen Recording should both list "Codex Computer Use" as on. The real proof is Check it step 3 passing.

## Install

Pick the steps for your OS, then register `codex-cu` with each harness you use. Every step is safe to re-run.

### macOS

```bash
# 1. Put the folder where Claude Code looks for skills.
cd /path/to/desktop-control   # this folder, wherever you saved it
mkdir -p ~/.claude/skills && cp -R . ~/.claude/skills/desktop-control

# 2. Register the MCP server with each harness you use.
#    Claude Code (the remove makes re-runs clean; it errors harmlessly the first time):
claude mcp remove -s user codex-cu 2>/dev/null || true
claude mcp add -s user codex-cu -- node ~/.claude/skills/desktop-control/cu-mcp.mjs

# 3. The absolute path to use in JSON configs (other harnesses below):
echo ~/.claude/skills/desktop-control/cu-mcp.mjs
```

### Windows (PowerShell)

```powershell
# 1. Put the folder where Claude Code looks for skills.
Set-Location C:\path\to\desktop-control   # this folder, wherever you saved it
New-Item -ItemType Directory -Force "$HOME\.claude\skills\desktop-control" | Out-Null
Copy-Item -Force .\* "$HOME\.claude\skills\desktop-control"

# 2. Register the MCP server with each harness you use.
#    Claude Code (the remove makes re-runs clean; it errors harmlessly the first time):
claude mcp remove -s user codex-cu 2>$null
claude mcp add -s user codex-cu -- node "$HOME\.claude\skills\desktop-control\cu-mcp.mjs"

# 3. The absolute path to use in JSON configs (other harnesses below), with forward slashes:
"$HOME\.claude\skills\desktop-control\cu-mcp.mjs" -replace '\\', '/'
```

### Other harnesses

In JSON configs, `<path to cu-mcp.mjs>` must be the full absolute path printed by step 3, for example `/Users/you/.claude/skills/desktop-control/cu-mcp.mjs` or `C:/Users/you/.claude/skills/desktop-control/cu-mcp.mjs`. `~` and `$HOME` are not expanded there, and the server fails to connect.

- **cursor-agent / Cursor**: copy the skill so Cursor's agents see it too. The server still runs from the `~/.claude` copy.
  - macOS, from inside this folder (as in step 1): `mkdir -p ~/.cursor/skills && cp -R . ~/.cursor/skills/desktop-control`
  - Windows, from inside this folder (as in step 1): `New-Item -ItemType Directory -Force "$HOME\.cursor\skills\desktop-control" | Out-Null; Copy-Item -Force .\* "$HOME\.cursor\skills\desktop-control"`

  Then add this to `~/.cursor/mcp.json` (`$HOME\.cursor\mcp.json` on Windows). If the file doesn't exist, this snippet is the whole file; otherwise merge `codex-cu` into the existing `mcpServers`:
  ```json
  { "mcpServers": { "codex-cu": { "command": "node", "args": ["<path to cu-mcp.mjs>"] } } }
  ```
  Run from most folders it's "ready" right away. Run from your home folder it shows "needs approval", because there `~/.cursor/mcp.json` also counts as a project config. In that case run `cursor-agent mcp enable codex-cu` from that directory, or pass `--approve-mcps` to headless runs.
- **opencode** (version 2): reads skills from `~/.claude/skills`, so it needs no copy. Add an `mcp` key at the top level of `~/.config/opencode/opencode.json` (or `opencode.jsonc`, whichever exists), next to the keys already there. If neither file exists, create `opencode.json` containing just this snippet; if an `mcp` key already exists, add `codex-cu` inside its `servers`:
  ```json
  { "mcp": { "servers": { "codex-cu": { "type": "local", "command": ["node", "<path to cu-mcp.mjs>"] } } } }
  ```
  opencode 1 used `{ "mcp": { "codex-cu": { ..., "enabled": true } } }` instead, without `servers`. opencode 2 keeps a background service running; run `opencode service restart` after editing the config.

### Check it

Steps 1 and 2 only prove the server starts; step 3 proves it can drive apps.

1. The server starts and answers. This prints one JSON line containing `"serverInfo":{"name":"rmcp"`:
   - macOS: `printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node ~/.claude/skills/desktop-control/cu-mcp.mjs`
   - Windows: `'{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node "$HOME\.claude\skills\desktop-control\cu-mcp.mjs"`
2. Each harness sees it: `claude mcp get codex-cu`, `cursor-agent mcp list` and `opencode mcp list` should show it connected or ready. To check the skill, run `opencode api GET /api/skill | grep desktop-control` (PowerShell: `| Select-String desktop-control`), or ask a harness (for example `claude -p "list your skills"`); `desktop-control` should be listed.
3. End to end: start a new session in your harness and ask: "Operate the Calculator app so its display shows 12 x 12, then read the result back from the app. If Calculator is already open, reuse that window. Drive the app; don't compute it yourself." Calculator doesn't need to be open first. You should see it change and get 144 back. Calculator remembers its last result, so use different numbers for each harness you check. To confirm the tool really ran, search the output for the tool's name: `mcp__codex-cu__js` (Claude Code), `codex-cu-js` (cursor-agent) or `codex-cu` (opencode 2 calls it through its `execute` tool as `tools["codex-cu"].js`). Headless runs show it with `claude -p "<prompt>" --output-format stream-json --verbose --allowedTools mcp__codex-cu__js`, `cursor-agent -p --force --approve-mcps --output-format stream-json "<prompt>"` or `opencode run --format json "<prompt>"`. Headless Claude Code refuses tools that aren't allowed, hence `--allowedTools`. Headless cursor-agent needs both flags: `--approve-mcps` loads the server, and `--force` trusts the directory and lets it run the tool. Calculator stays open afterwards; quit it when you're done.

## How it works

The Codex app installs a plugin at `~/.codex/plugins/cache/openai-bundled/unified-computer-use/<version>/.mcp.json` (`%USERPROFILE%\.codex\...` on Windows). Its `cua_repl` entry is a standard stdio MCP server built from OpenAI's `@oai/cua-repl` package. Its main tool, `js`, is a persistent JavaScript REPL holding a `cua` object that drives apps. `cu-mcp.mjs` is a small proxy around it:

1. On every start, it reads the newest numeric version's `.mcp.json`, so Codex app updates are picked up automatically.
2. It launches `cua_repl` with that file's command and env, plus `CUA_REPL_ENABLED_SURFACES=computer`. The plugin's browser control needs Codex session metadata and only errors elsewhere (`Missing required Codex turn metadata`).
3. It tells `cua_repl` that the client supports MCP form elicitation, then accepts every approval request itself. `cua_repl` asks before each app and action ("Allow Computer Use to use Calculator?"). Most harnesses can't answer that when running headless, and without the proxy you get one of two errors:
   - `nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation`, from clients without elicitation.
   - `Computer Use was not approved to use <app>`, from headless Claude Code.

   Accepting everything is deliberate, so agents run without interruption. If you want prompts, don't use this proxy.

`tools/list` also shows `js_reset`, `js_add_node_module_dir` and `turn_ended`. `turn_ended` is a Codex hook target; ignore it. Codex caps `js` output at about 25k tokens, but that limit is applied by Codex, so other harnesses get the full output.

### macOS specifics

- The engine lives inside `/Applications/ChatGPT.app/Contents/Resources/cua_node`. The helper app is `~/.codex/computer-use/Codex Computer Use.app` (`com.openai.sky.CUAService`). It holds the Accessibility and Screen Recording permissions, and the engine starts it on demand.
- It works through the accessibility tree in the background, without taking focus.
- The `js` kernel runs in the Codex sandbox, as it does inside Codex: read-only filesystem and no network. File writes from `js` fail with `EPERM`.

### Windows specifics

- The engine lives in `%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\<hash>`, with the helper `bin\node_modules\@oai\sky\bin\windows\codex-computer-use.exe` inside it.
- The Windows plugin file assumes the Codex app is running, so the proxy adjusts the env:
  - Removes `SKY_CUA_NATIVE_PIPE` and `SKY_CUA_NATIVE_PIPE_DIRECTORY`. They point at a pipe owned by the running Codex app; without them, the engine starts its own helper.
  - Removes `CODEX_CLI_PATH`. Otherwise the kernel starts inside the Codex Windows sandbox, which only works under the app, and dies with `windows sandbox failed: CreateProcessWithLogonW failed: 1056`. As a result, the `js` kernel is not sandboxed on Windows.
  - Puts the folder that `CODEX_CLI_PATH` pointed to (the app's own `codex.exe`) at the front of the server's `PATH`. The helper runs `codex app-server` for auth, and without a `codex` on `PATH` it fails with `failed to launch codex app-server: program not found`. This only affects the server process, not your system `PATH`.
  - Adds `sky: "@oai/sky/service"` to `NODE_REPL_TRUSTED_SERVICES`. Otherwise it fails with `Trusted RPC service is not configured: sky`.
- It must run in your signed-in desktop session. Agents started over SSH run in session 0: the server starts and Check it steps 1 and 2 pass, but the window list comes back empty and nothing can be driven. To test from an SSH shell, run the test through a scheduled task in the desktop session. Scheduled tasks have no shell (so `>` and `<` don't work in `/TR`) and start in `C:\Windows\system32`, so put the command in a `.cmd` file:
  ```bat
  @echo off
  cd /d %USERPROFILE%
  set "PROMPT_TEXT=Operate the Calculator app so its display shows 21 x 3, then read the result back from the app. If Calculator is already open, reuse that window. Drive the app, do not compute it yourself."
  claude -p "%PROMPT_TEXT%" --output-format stream-json --verbose --allowedTools mcp__codex-cu__js < NUL > %USERPROFILE%\cu-test.txt 2>&1
  echo DONE > %USERPROFILE%\cu-test-done.txt
  ```
  For the other harnesses, swap the `claude` line for one of these. `cursor-agent` is itself a `.cmd` file, so it needs `call` or the batch stops after it:
  ```bat
  call cursor-agent -p --force --approve-mcps --output-format stream-json "%PROMPT_TEXT%" < NUL > %USERPROFILE%\cu-test.txt 2>&1
  opencode run --format json "%PROMPT_TEXT%" < NUL > %USERPROFILE%\cu-test.txt 2>&1
  ```
  Save it as `%USERPROFILE%\cu-test.cmd`, then run `schtasks /Create /TN cu-test /TR "%USERPROFILE%\cu-test.cmd" /SC ONCE /ST 23:59 /RL LIMITED /IT /F` and `schtasks /Run /TN cu-test`. Wait until `cu-test-done.txt` appears (or `schtasks /Query /TN cu-test` shows `Ready`), then read `cu-test.txt`. The marker gets its own file because the server's processes can hold `cu-test.txt` open for a few seconds after the harness exits. Clean up with `schtasks /Delete /TN cu-test /F` and delete the two text files.
  To stop a runaway test, `schtasks /End /TN cu-test` isn't enough: it ends the batch file but leaves the harness running. Also stop the harness, for example `Stop-Process -Name opencode` or `Stop-Process -Name claude`.
- Input brings the target window to the front and moves the cursor.
- Some packaged apps, Calculator included, expose no accessibility tree. Agents fall back to screenshots and coordinate clicks (see `SKILL.md`).

## Debugging

- Startup problems print as `codex-cu: ...` on stderr. Run the check in "Check it" step 1 to see them.
  - `no Codex computer use plugin at ...`: the Codex app isn't installed, or Computer Use hasn't been used in it since install or update. Do the one Computer Use run from Requirements.
  - `could not start cua_repl`: the engine path in the plugin's `.mcp.json` is gone, usually because the app was updated or removed. Open the Codex app and use Computer Use once to refresh it.
- If the harness shows `codex-cu` as failed (for example `MCP error -32000: Connection closed`) but step 1 works, the path in its config probably isn't absolute (`~` or `$HOME` aren't expanded in JSON), or the harness can't find `node`. Use the absolute path to `cu-mcp.mjs`, and if needed the full path to node (`which node` or `where.exe node`).
- On macOS, if apps don't respond or screenshots are blank, check System Settings > Privacy & Security > Accessibility and Screen Recording for "Codex Computer Use".
- After a Codex app update breaks something, compare the new `.mcp.json` with the env vars listed above. On Windows, the three changes are the likeliest thing to need updating. The `@oai/cua-repl` package's own `README.md` and `instructions/` folder, inside the engine directory, are the best reference.
- If the agent gives the answer without a `codex-cu` `js` call, it either computed it itself or the server wasn't loaded. A cursor-agent without approval has even run `cu-mcp.mjs` through its shell instead. Check `mcp list`, then tell it to drive the app.
- `failed to launch codex app-server: program not found` (Windows): the app's bundled `codex.exe` wasn't found. Check that `CODEX_CLI_PATH` in the plugin's `.mcp.json` points to an existing file; if not, open the Codex app to refresh it.
- An empty window list (`list_windows()` returns `[]`) on Windows means the harness isn't running in the desktop session, for example because it was started over SSH.
