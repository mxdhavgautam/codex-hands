# codex-hands

Give Claude Code, Cursor's `cursor-agent` and opencode the same computer use Codex has, on macOS and Windows.

The Codex app ships a capable computer use engine: background control on macOS, Windows UI Automation and screenshots, and a JavaScript tool that can chain many actions in one call. `codex-hands` exposes that engine to any MCP-capable agent as the `codex-cu` server, plus a skill that tells agents when and how to use it.

```
desktop-control/
  cu-mcp.mjs   the codex-cu MCP server (a small proxy around Codex's engine)
  SKILL.md     agent instructions
  README.md    requirements, install, checks, how it works, debugging
```

## Quick start

You need the Codex app installed with Computer Use used in it once, Node.js 18+, and a model that can see images.

```bash
git clone https://github.com/mxdhavgautam/codex-hands
cd codex-hands/desktop-control
```

Then follow [`desktop-control/README.md`](desktop-control/README.md). It covers macOS and Windows, Claude Code, cursor-agent and opencode, and how to verify each one end to end.

## Notes

- The engine and helper apps belong to OpenAI and come from the Codex app; this repo only contains the proxy, skill and docs. Not affiliated with OpenAI.
- Every computer use approval is accepted automatically so agents run without interruption. Don't use this if you want per-action prompts.
- Codex app updates can rename what the proxy relies on. The README's debugging section says where to look.
