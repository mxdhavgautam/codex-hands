---
name: desktop-control
description: Computer use on this machine (macOS or Windows) through the `codex-cu` MCP server, which is Codex's own computer use. Read this, not the claude.ai computer-use skill, before any request to use, operate or look at a desktop app or the screen (Calculator, Finder, Settings, Notepad, any native app or file chooser). The claude.ai skill needs the Claude desktop app; here computer use is the `codex-cu` MCP server.
---

# Desktop control

Use the `codex-cu` MCP server's `js` tool (your harness may name it `mcp__codex-cu__js`, `codex-cu_js` or `codex-cu-js`). Don't delegate to a Codex agent for this.

- The first `js` call of a session must be exactly one entry call: `await cua.getState();` (works everywhere), or on macOS `let app = await cua.getApp("Calculator");`. Its result includes the full API docs; read them before going further.
- State persists between calls. Use `globalThis.x = ...` for anything you need in a later call.
- Approvals are accepted automatically. Still confirm with the user before destructive, financial or sending actions.
- Reuse an app's existing window instead of launching it again (every launch on Windows opens another window). Close windows you opened when the task is done. If you're stuck after a few attempts, stop and tell the user rather than retrying in a loop.

## macOS

`cua.getApp("Name")` returns an accessibility tree. Click by element index, then read the result from the next tree. It works in the background without stealing focus. The `js` kernel is sandboxed like in Codex (read-only filesystem, no network), so do file work with your normal tools.

## Windows

- `cua.getApp` needs a window id, not a name: start with `await cua.getState()`, then `cua.getApp({ windowId })` using an id from its `windows`. If the app has no window, `await cua.computer.launch_app({ app: id })` and check again.
- Input brings the target window to the front, and the cursor moves visibly.
- The accessibility tree is empty for some packaged apps (Calculator). The `cua.getApp({ windowId })` object still works there through `pressKey`, `typeText` and `getScreenshot`. For coordinate clicks, use the lower-level API: `const C = cua.computer;`, take the window entry from `await C.list_windows()` and pass that whole `{ app, id }` object as `window` (not just the id) to `C.click({ window, x, y })`, `C.press_key({ window, key })` and `C.type_text({ window, text })`. `await C.get_window_state({ window })` returns a screenshot; pass `include_text: true` to try for a tree.
- Reading a screenshot needs a model that can see images. Without that, copy the value with `ctrl+c` (never `super+c`, which opens Copilot) and read the clipboard with your normal tools. If two read-backs fail, stop and tell the user.
- Only works when your harness runs in the signed-in desktop session. Agents started over SSH can't see the desktop.

If `codex-cu` is missing, fails to start or behaves oddly, see `README.md` next to this file for setup and debugging.
