# desktop-control: Codex computer use for any agent

This folder gives Claude Code, Cursor's `cursor-agent` and opencode the same computer use that Codex has, on macOS and Windows. It contains:

- `cu-mcp.mjs`: an MCP server (`codex-cu`) that runs the computer use engine the Codex app installs.
- `turn-ended.mjs`: used by `cu-mcp.mjs` on macOS to tell the helper a task's turn ended, so a Mac it unlocked gets locked again.
- `turn-end-hook.mjs`: a Stop hook for Claude Code that tells that session's `cu-mcp.mjs` the agent's turn ended (releases its browser tabs, lets the Mac lock again).
- `SKILL.md`: tells agents when and how to use it.
- `README.md`: this file, for setup and debugging.

Codex itself already has computer use built in and needs nothing from here.

## Requirements

- **macOS or Windows**, with you signed in at the desktop. Linux isn't supported.
- **The Codex app installed, with Computer Use working in it once.** On macOS that's the ChatGPT app; on Windows it's the Codex app from the Microsoft Store. Open it, ask Codex to do something with Computer Use (for example "use Calculator to work out 2 + 2"), and accept any prompts. On macOS this includes granting Accessibility and Screen Recording to "Codex Computer Use". That one run downloads the engine and grants the permissions this setup reuses. Afterwards the app doesn't need to be running.
- **Node.js 18 or newer** on `PATH` (`node --version`).
- **For browsers (optional):** the Chrome plugin installed in the Codex app, and OpenAI's ChatGPT extension added to each Chromium browser you want agents to use (Chrome, Helium and so on). Each install of the extension gets its own `extensionInstanceId`, which is how agents tell browsers apart.
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

Then add the Stop hook (both platforms) to `~/.claude/settings.json`, merging it into any `hooks` you already have:

```json
"hooks": {
  "Stop": [
    { "hooks": [ { "type": "command", "command": "f=\"$HOME/.claude/skills/desktop-control/turn-end-hook.mjs\"; [ -f \"$f\" ] && node \"$f\"; exit 0" } ] }
  ]
}
```

Without it everything still works, but turns only end after 15 idle minutes or when the session ends, so tabs and an unlocked Mac are held longer. cursor-agent and opencode can't use this hook (they don't give MCP servers a session id), so they get that fallback.

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

Steps 1 and 2 only prove the server starts; steps 3 and 4 prove it can drive apps and browsers.

1. The server starts and answers. This prints one JSON line containing `"serverInfo":{"name":"rmcp"`:
   - macOS: `printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node ~/.claude/skills/desktop-control/cu-mcp.mjs`
   - Windows: `'{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' | node "$HOME\.claude\skills\desktop-control\cu-mcp.mjs"`
2. Each harness sees it: `claude mcp get codex-cu`, `cursor-agent mcp list` and `opencode mcp list` should show it connected or ready. To check the skill, run `opencode api GET /api/skill | grep desktop-control` (PowerShell: `| Select-String desktop-control`), or ask a harness (for example `claude -p "list your skills"`); `desktop-control` should be listed.
3. End to end: start a new session in your harness and ask: "Operate the Calculator app so its display shows 12 x 12, then read the result back from the app. If Calculator is already open, reuse that window. Drive the app; don't compute it yourself." Calculator doesn't need to be open first. You should see it change and get 144 back. Calculator remembers its last result, so use different numbers for each harness you check. To confirm the tool really ran, search the output for the tool's name: `mcp__codex-cu__js` (Claude Code), `codex-cu-js` (cursor-agent) or `codex-cu` (opencode 2 calls it through its `execute` tool as `tools["codex-cu"].js`). Headless runs show it with `claude -p "<prompt>" --output-format stream-json --verbose --allowedTools mcp__codex-cu__js`, `cursor-agent -p --force --approve-mcps --output-format stream-json "<prompt>"` or `opencode run --format json "<prompt>"`. Headless Claude Code refuses tools that aren't allowed, hence `--allowedTools`. Headless cursor-agent needs both flags: `--approve-mcps` loads the server, and `--force` trusts the directory and lets it run the tool. Calculator stays open afterwards; quit it when you're done.
4. Browsers (if you set them up): ask "Open https://example.com in my browser and tell me the page title." It should answer "Example Domain" without the browser window coming to the front. With several browsers, ask it to list them first (`cua.getState()` shows each one's `metadata.extensionInstanceId`), then open a test tab in each by id and check which browser each tab appeared in, since they can all report the name "Chrome". Note the ids and names somewhere your agents read (for example your global AGENTS.md or CLAUDE.md), with a line telling them to pick browsers by that id.

## How it works

The Codex app installs a plugin at `~/.codex/plugins/cache/openai-bundled/unified-computer-use/<version>/.mcp.json` (`%USERPROFILE%\.codex\...` on Windows). Its `cua_repl` entry is a standard stdio MCP server built from OpenAI's `@oai/cua-repl` package. Its main tool, `js`, is a persistent JavaScript REPL holding a `cua` object that drives apps. `cu-mcp.mjs` is a small proxy around it:

1. On every start, it reads the newest numeric version's `.mcp.json`, so Codex app updates are picked up automatically.
2. It launches `cua_repl` with that file's command and env, including its `CUA_REPL_ENABLED_SURFACES` (`browser,computer`). Browser control works because of step 4; without turn metadata it fails with `Missing required Codex turn metadata`.
3. It tells `cua_repl` that the client supports MCP form elicitation, then accepts every approval request itself. `cua_repl` asks before each app and action ("Allow Computer Use to use Calculator?"). Most harnesses can't answer that when running headless, and without the proxy you get one of two errors:
   - `nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation`, from clients without elicitation.
   - `Computer Use was not approved to use <app>`, from headless Claude Code.

   Accepting everything is deliberate, so agents run without interruption. If you want prompts, don't use this proxy.
4. It tags every tool call with Codex-style turn metadata (`_meta["x-codex-turn-metadata"]`, a JSON string with `session_id` and `turn_id`), where `session_id` is `<session id>/<proxy pid>/<turn number>`: the harness's session id where it exposes one to MCP servers (Claude Code's `CLAUDE_CODE_SESSION_ID`), a random one otherwise. The helper treats `session_id` as the thread and releases a thread's unlock without checking the turn, so a new thread id per turn and per proxy keeps a late turn end from releasing the next turn's unlock, or another proxy's for the same session. When the Mac is locked in a way that blocks Computer Use (for example a background wake with the display off), the helper only unlocks it for a request it can tie to a thread, and locks it again when that thread's turn ends. Browser tabs an agent opens are tracked per `session_id` and `turn_id` and closed when the turn ends, unless the agent marks them deliverable. The proxy ends a turn when Claude Code's Stop hook runs `turn-end-hook.mjs` (it signals the control socket each proxy opens for its `CLAUDE_CODE_SESSION_ID`, `codex-cu-<hash>-<pid>.sock` in the temp dir or the `\\.\pipe\codex-cu-<hash>-<pid>` pipe on Windows, so only that session's proxies hear it), after 15 minutes with no tool call in flight for harnesses without a hook (off once a hook has been seen; a cancelled call counts until `cua_repl` answers it), and when the client disconnects or the proxy gets a stop signal (it ends the turn first, waiting up to 5 seconds for calls in flight, then lets `cua_repl` exit). A hook that arrives mid-call waits for the call. At each turn end it calls `cua_repl`'s hidden `turn_ended` tool, which releases the tabs, and on macOS runs `turn-ended.mjs` (next to it) under the Codex app's bundled node. That script sends `ComputerUseIPCCodexTurnEndedRequest` over the helper's socket (`~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`). The helper only answers a client whose parent process is signed by OpenAI, so the script relaunches itself once under the bundled node and sends from that copy. `SkyComputerUseClient turn-ended`, Codex's own notify hook, doesn't work from other harnesses: macOS refuses its AppleEvent while still exiting 0. If the proxy is killed outright it can't report the turn end. Without the metadata you get `The Mac is locked and this Computer Use request cannot be associated with a ChatGPT thread`.

`tools/list` also shows `js_reset`, `js_add_node_module_dir` and `turn_ended`. `turn_ended` is for the proxy (it releases browser tabs but doesn't reach the macOS helper); agents should ignore it. Codex caps `js` output at about 25k tokens, but that limit is applied by Codex, so other harnesses get the full output.

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
- `The Mac is locked and ...` (macOS): on an ordinary lock screen Computer Use keeps working in the background, so this only appears when macOS can't serve it locked, such as a background wake with the display off. `cannot be associated with a ChatGPT thread` means the request had no turn metadata: an old `cu-mcp.mjs`, or something calling `cua_repl` directly. `automatic unlock could not unlock it` or `paused because physical input was detected` come from the helper's own unlock, which needs the locked-use setup in the Codex app; unlock manually in that case.
- `Unable to load browser request-header policy. Retry the browser command.`: the browser side couldn't fetch OpenAI's feature config in time, most often when several sessions start browser work at once. Retrying the call works.
- `getState()` lists no browsers: the Codex app's Chrome plugin or the ChatGPT extension isn't installed, or the browser isn't running.
- An empty window list (`list_windows()` returns `[]`) on Windows means the harness isn't running in the desktop session, for example because it was started over SSH.
