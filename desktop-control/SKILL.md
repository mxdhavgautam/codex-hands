---
name: desktop-control
description: Computer use on this machine (macOS or Windows) through the `codex-cu` MCP server, which is Codex's own computer use. Use it whenever seeing or operating a desktop app, a web page in the user's Chromium browser (Chrome, Helium and others with the ChatGPT extension) or the screen is the most direct way to do or check something, even if the user never mentions computer use: checking a UI you just changed, a native app or settings pane (Calculator, Finder, Settings, Notepad), a signed-in website, a file chooser, anything with no CLI or API. Prefer it over the claude.ai computer-use skill, which needs the Claude desktop app.
---

# Desktop control

Use the `codex-cu` MCP server's `js` tool (your harness may name it `mcp__codex-cu__js`, `codex-cu_js` or `codex-cu-js`). Reach for it on your own when looking at or clicking through an app is the quickest way to finish or verify a task; don't ask the user to click something you can click yourself. If your harness has its own built-in computer use, use that instead. Both work while the Mac is locked.

- The first `js` call of a session must be exactly one entry call: `await cua.getState();` (works everywhere), or on macOS `let app = await cua.getApp("Calculator");`. Its result includes the full API docs; read them before going further.
- State persists between calls. Use `globalThis.x = ...` for anything you need in a later call.
- Approvals are accepted automatically. Still confirm with the user before destructive, financial or sending actions.
- Reuse an app's existing window instead of launching it again (every launch on Windows opens another window). Close windows you opened when the task is done. If you're stuck after a few attempts, stop and tell the user rather than retrying in a loop.

## Browsers

Chromium browsers with OpenAI's ChatGPT extension (Chrome, Helium and others) are driven through the extension, in the background, with the user's own sign-ins. Prefer this to clicking through the browser window with computer use.

- `await cua.getState()` lists them under `browsers`. Several can all be named "Chrome", so pick one by `metadata.extensionInstanceId` (AGENTS.md lists the user's browsers and their ids): `let browser = await cua.getBrowser({ extensionInstanceId: "<id>" });`.
- Open a tab straight at the URL: `globalThis.tab = await cua.createBrowserTab(browser.browserId, "https://example.com");`. The first `getBrowser` call shows the browser API docs; follow them.
- Tabs you open close when your turn ends. If the user should keep one, call `await tab.markDeliverable()` (or `markHandoff()` to hand it over mid-task) before finishing.

## macOS

`cua.getApp("Name")` returns an accessibility tree. Click by element index, then read the result from the next tree. It works in the background without stealing focus. The `js` kernel is sandboxed like in Codex (read-only filesystem, no network), so do file work with your normal tools.

## Windows

- `cua.getApp` needs a window id, not a name: start with `await cua.getState()`, then `cua.getApp({ windowId })` using an id from its `windows`. If the app has no window, `await cua.computer.launch_app({ app: id })` and check again.
- Input brings the target window to the front, and the cursor moves visibly.
- The accessibility tree is empty for some packaged apps (Calculator). The `cua.getApp({ windowId })` object still works there through `pressKey`, `typeText` and `getScreenshot`. For coordinate clicks, use the lower-level API: `const C = cua.computer;`, take the window entry from `await C.list_windows()` and pass that whole `{ app, id }` object as `window` (not just the id) to `C.click({ window, x, y })`, `C.press_key({ window, key })` and `C.type_text({ window, text })`. `await C.get_window_state({ window })` returns a screenshot; pass `include_text: true` to try for a tree.
- Reading a screenshot needs a model that can see images. Without that, copy the value with `ctrl+c` (never `super+c`, which opens Copilot) and read the clipboard with your normal tools. If two read-backs fail, stop and tell the user.
- Only works when your harness runs in the signed-in desktop session. Agents started over SSH can't see the desktop.

If `codex-cu` is missing, fails to start or behaves oddly, see `README.md` next to this file for setup and debugging.
