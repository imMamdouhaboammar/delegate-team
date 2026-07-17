---
name: agent-kernel
description: |
  Local-first governance kernel for AI coding agents — gives Claude Code, Codex, Cursor,
  Antigravity, and Gemini CLI a shared memory, an approval inbox for new rules, generated
  AGENTS.md / CLAUDE.md / cursor-rule.mdc, Claude + git hooks, and a deterministic
  policy guard. Adds a JSON-first memory layer (rules + preferences + workflows + project-notes
  + skills), an episodic memory archive, and MCP tools for search/read/capture/sync of past
  sessions. Use when the user asks to "remember this rule", "save this as a memory",
  "what did we do last time", "search past episodes", "propose a new rule", "make agent
  follow our standards automatically", or any request to give an agent persistent local
  memory across sessions. Bundled inside delegate-team v2.5.0 — installed via
  `./install.sh --kernel`. Triggers on: "agent kernel", "ak", "remember this", "save this rule",
  "memory tool", "episodic memory", "approval inbox", "guard policy", "rule inbox".
---

# agent-kernel — local-first governance + memory layer

> **The memory backbone of delegate-team.** A vendored, version-pinned copy of
> [@mamdouh/agent-kernel@0.0.5](https://github.com/imMamdouhaboammar/agent-kernel) ships
> inside this repo at `agent-kernel/dist/cli.mjs`. Installed by default with
> `./install.sh --all` in delegate-team v2.5.0+.

## What this skill IS

A **single Node.js CLI** (`agent-kernel` / `ak`) that gives every coding agent you use:

1. A **shared local memory** at `~/.agent-kernel/source/memories/*.json`
2. An **episodic memory archive** at `~/.agent-kernel/episodes/` (with search/show/stats)
3. An **approval inbox** so agents can propose rules but only the kernel publishes them
4. **Generated instruction files** for every agent:
   - `AGENTS.md` (Claude Code / Codex / Cursor / OpenCode)
   - `CLAUDE.md`
   - `.cursor/rules/00-agent-kernel.mdc`
   - `.agents/agents.md`
   - `GEMINI.md`
5. **Hooks** — Claude `PreToolUse` + `PostToolUse`, git `pre-commit`, optional CI guard
6. **MCP tools** — `agent_kernel_search_episodes`, `agent_kernel_read_episode`,
   `agent_kernel_capture_episode`, `agent_kernel_sync_episodes`
7. **A deterministic policy guard** — blocks dangerous `rm -rf`, curl|sh, force-push to main,
   secret leaks, and any rule you add

## Why bundle it inside delegate-team

delegate-team orchestrates many agents. Without a shared memory, each session starts cold —
the same standards get repeated every conversation. agent-kernel solves that:

| Without agent-kernel | With agent-kernel |
|---|---|
| Standards repeated in every prompt | Standards live in `~/.agent-kernel/source/memories/*.json` and auto-attach |
| Lost context after session end | Episodes saved locally; searchable later |
| Agent writes whatever rule it wants | Proposal inbox; you approve before publish |
| Manual `git commit` may leak secrets | Pre-commit hook + `agent-kernel guard --staged` blocks |
| Different agents see different rules | One JSON-first source compiles to all platforms |

## Quick start (inside delegate-team)

```bash
# One command — link + init + link the project + install hooks
./install.sh --kernel

# Or auto-installed via:
./install.sh --all

# Verify
agent-kernel doctor
agent-kernel status
```

After installation, in any project:

```bash
agent-kernel init --sync --enforce   # First time in a project
agent-kernel link . --hooks         # Link AGENTS.md + git hook

# Save a rule
agent-kernel remember "Never add local SQLite fallback to production Supabase apps." \
    --type policy --level critical --tags supabase,database --publish

# Search episodes
agent-kernel episode search "SQLite fallback Supabase"
agent-kernel episode show <episode-id>
```

## Files in this vendored copy

```text
agent-kernel/
  dist/cli.mjs             # The CLI — single ~85KB ESM file
  docs/                    # 8 architecture + protocol docs
  examples/                # CI guard workflow, sample memory rules, sample episode
  develpment/              # Backlog + epics + milestones + sprint plan + backlog.json
  LICENSE                  # MIT
  README.md                # Upstream README (verbatim)
  scripts/build.mjs        # Build script (not used here — cli.mjs is shipped pre-built)
  SKILL.md                 # THIS FILE — Skills.sh manifest
  install.sh               # Local installer
  wrapper.sh               # Bash shim — prefers global agent-kernel, falls back to vendored
  MEMORY.md                # How delegate-team uses this for memory
  VERSION                  # 0.0.5
```

## Compatibility

| Agent | Memory source | Hook install | Compile target |
|---|---|---|---|
| Claude Code | ✅ via `AGENTS.md` + `CLAUDE.md` | ✅ `~/.claude/hooks/` | `PreToolUse` + `PostToolUse` |
| Codex | ✅ via `AGENTS.md` | n/a (read-only) | `AGENTS.md` |
| Cursor | ✅ via `.cursor/rules/00-agent-kernel.mdc` | n/a | `.mdc` rule |
| OpenCode | ✅ via `AGENTS.md` | n/a | `AGENTS.md` |
| Antigravity | ✅ via `.agents/agents.md` | n/a | `.agents/` |
| Gemini CLI | ✅ via `GEMINI.md` | n/a | `GEMINI.md` |
| 60+ others | ✅ see Skills.sh index | depends on agent | via `AGENTS.md` |

Memory layout: **fully backward compatible with v0.0.1** (auto-migrates flat files via
`agent-kernel migrate json --publish`).

## Installation paths

| Path | When |
|---|---|
| Global `npm install -g @mamdouh/agent-kernel` (when published) | Preferred when user wants the latest |
| Vendored at `agent-kernel/dist/cli.mjs` | Default with delegate-team — guaranteed version match |
| `npx -y agent-kernel` | One-off use, no install |

The `wrapper.sh` shim picks the right one:

1. If `agent-kernel` on `$PATH` → use it (user's preferred version)
2. Else if `node agent-kernel/dist/cli.mjs` works → use vendored copy
3. Else → install on first use via `install.sh`

## See also

- `MEMORY.md` — how delegate-team uses agent-kernel for the /apeiron memory layer
- `docs/MEMORY_PROTOCOL.md` — rule + episode data model
- `docs/MCP_SERVER.md` — MCP tool definitions for non-CLI integration
- `docs/EPISODIC_MEMORY.md` — episode sync from Claude/Codex JSONL transcripts
- `docs/STRICT_MODE.md` — when to flip `--enforce`
- `docs/JSON_FIRST_STORAGE.md` — storage schema

## License

MIT (© Mamdouh Aboammar) — upstream `agent-kernel` v0.0.5.

## Repository

https://github.com/imMamdouhaboammar/delegate-team/tree/master/agent-kernel