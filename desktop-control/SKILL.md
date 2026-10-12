---
name: desktop-control
description: Computer use on this machine through the `codex-cu` MCP server. Reach for it on your own, without being asked, when the task is about what's on screen or what only a UI exposes: a native app or settings pane, a file chooser, a signed-in website in the user's Chromium browser, how a UI you changed looks and behaves, or a GUI where the CLI route would be a fragile workaround. Files, code, commands, git and plain public pages fit the shell, CLIs and fetch better. Prefer it over the claude.ai computer-use skill, which needs the Claude desktop app.
---

# Desktop control

Use the `codex-cu` MCP server's `js` tool (your harness may name it `mcp__codex-cu__js`, `codex-cu_js` or `codex-cu-js`). Mix it freely with the shell, CLIs and fetch, and click things yourself rather than asking the user to. If your harness has its own built-in computer use, use that instead.

- The first `js` call of a session must be exactly one entry call: `await cua.getState();` (works everywhere), or on macOS `let app = await cua.getApp("Calculator");`. Its result includes the full API docs; read them before going further.
- State persists between calls. Use `globalThis.x = ...` for anything you need in a later call.
- Approvals are accepted automatically. Still confirm with the user before destructive, financial or sending actions.
- Reuse an app's existing window instead of launching it again (every launch on Windows opens another window). Close windows you opened when the task is done.
- After three failed attempts at the same step, stop and tell the user.
- While the Mac is locked, listing apps and browser tabs still work, but app windows can't be read or driven until the user unlocks it. A call that fails for that reason says so; don't retry it, tell the user.

## Browsers

Chromium browsers with OpenAI's ChatGPT extension (Chrome, Helium and others) are driven through the extension, in the background, with the user's own sign-ins. Use it when a page needs those sign-ins or you need to see or use it as a person would; for just reading public content, a fetch is usually enough. Prefer it to clicking through the browser window with computer use.

- `await cua.getState()` lists them under `browsers`. Several can all be named "Chrome", so pick one by `metadata.extensionInstanceId` (AGENTS.md lists the user's browsers and their ids): `let browser = await cua.getBrowser({ extensionInstanceId: "<id>" });`.
- Open a tab straight at the URL: `globalThis.tab = await cua.createBrowserTab(browser.browserId, "https://example.com");`. The first `getBrowser` call shows the browser API docs; follow them.
- Tabs you open close when your turn ends. If the user should keep one, call `await tab.markDeliverable()` (or `markHandoff()` to hand it over mid-task) before finishing.

## macOS

`cua.getApp("Name")` returns an accessibility tree. Click by element index, then read the result from the next tree. It works in the background without stealing focus. The `js` kernel is sandboxed like in Codex (read-only filesystem, no network), so do file work with your normal tools.

## Windows

Read `WINDOWS.md` next to this file before the first call. There `cua.getApp` takes a window id, input moves the real cursor, and some apps can only be read from screenshots.

## Troubleshooting

If `codex-cu` is missing, fails to start or behaves oddly, see `README.md` next to this file for setup and debugging.
