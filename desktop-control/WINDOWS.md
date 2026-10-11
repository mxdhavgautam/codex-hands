# Desktop control on Windows

What differs from `SKILL.md` when the machine runs Windows.

- It only works when your harness runs in the signed-in desktop session. Agents started over SSH can't see the desktop.
- `cua.getApp` needs a window id, not a name: start with `await cua.getState()`, then `cua.getApp({ windowId })` using an id from its `windows`. If the app has no window, `await cua.computer.launch_app({ app: id })` and check again.
- Input brings the target window to the front, and the cursor moves visibly.
- The accessibility tree is empty for some packaged apps (Calculator). The `cua.getApp({ windowId })` object still works there through `pressKey`, `typeText` and `getScreenshot`.
- For coordinate clicks, use the lower-level API: `const C = cua.computer;`, take the window entry from `await C.list_windows()` and pass that whole `{ app, id }` object as `window` (not just the id) to `C.click({ window, x, y })`, `C.press_key({ window, key })` and `C.type_text({ window, text })`. `await C.get_window_state({ window })` returns a screenshot; pass `include_text: true` to try for a tree.
- Reading a screenshot needs a model that can see images. Without one, copy the value with `ctrl+c` and read the clipboard with your normal tools (`super+c` opens Copilot instead). If two read-backs fail, stop and tell the user.
