# agent-kernel (imMamdouhaboammar/agent-kernel)

**Role**: Memory + governance layer. Local-first shared memory, episodic recall,
approval inbox for new rules, and deterministic policy guard for every coding
agent in your toolchain.

> **Note**: As of delegate-team v2.5.0, agent-kernel is bundled inside this repo at
> `agent-kernel/`. You do NOT need to install it separately — `./install.sh --kernel`
> (or `--all`) handles everything. This doc is for understanding what it does
> and how it composes with the rest of the supersystem.

- **Repo**: https://github.com/imMamdouhaboammar/agent-kernel (MIT, v0.0.5)
- **Bundled at**: `./agent-kernel/dist/cli.mjs` (~85 KB single ESM file)
- **Binary names**: `agent-kernel`, `ak`
- **Memory home**: `~/.agent-kernel/` (configurable via `AGENT_KERNEL_HOME`)

## What it adds to delegate-team

| Without agent-kernel | With agent-kernel |
|---|---|
| Standards repeated every session | Standards live in `~/.agent-kernel/source/memories/*.json`, compiled to all agents |
| Lost context after session ends | Episodes saved locally + searchable across sessions |
| Agent writes whatever rule it wants | Proposal inbox → you approve → kernel publishes |
| `git commit` may leak secrets | Pre-commit hook + `agent-kernel guard --staged` |
| Each agent (Codex / Claude / Cursor / Gemini) sees different rules | One JSON source compiles to all platforms |

## Install (automatic)

```bash
# Part of the delegate-team supersystem:
./install.sh --kernel           # Just the kernel
./install.sh --all              # Kernel + orchestrator + mmas + integrations

# Verify
agent-kernel doctor
agent-kernel status
```

The wrapper at `agent-kernel/wrapper.sh` resolves the right binary in this order:

1. `$AGENT_KERNEL_BIN` env var (override)
2. `agent-kernel` on `$PATH` (your preferred install)
3. Vendored `agent-kernel/dist/cli.mjs` via `node` (default with delegate-team)
4. `npx -y @mamdouh/agent-kernel` (when published upstream, best-effort)

This means **the rest of the supersystem never breaks if the binary is missing** —
each call falls through gracefully.

## Initialize your first project

```bash
cd ~/Projects/YourProject
agent-kernel init --sync --enforce
agent-kernel link . --hooks
agent-kernel doctor
```

This drops an `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/00-agent-kernel.mdc`,
`.agents/agents.md`, `GEMINI.md`, and a `pre-commit` hook into the project.

## Save your first memory

```bash
agent-kernel remember "Never add local SQLite fallback to production Supabase apps." \
    --type policy --level critical --tags supabase,database --publish
```

The next time any agent in any project touches that code, the rule auto-attaches.

## Capture an episode (for future recall)

```bash
agent-kernel episode add \
    --title "Stripe webhook bug fix" \
    --tags stripe,webhook,bug \
    --text "Root cause: missing signature verification on /api/stripe webhook. Fix: verify signature via stripe.webhooks.constructEvent()."
```

Later:

```bash
agent-kernel episode search "stripe webhook"
```

## How delegate-team components use agent-kernel

| Component | How it uses the kernel |
|---|---|
| `/apeiron` orchestrator | Saves chain outcome as an episode at the end |
| `mm/multi-agent` (MMAS) | All 8 agents read the same memory; proposals go to inbox |
| `dt` CLI / backends | Pull context via `memory search` before delegating |
| `mavis-skill-scaffold` | Registers new skills as memories |
| All agents (Claude / Codex / Cursor / Gemini / OpenCode / 60+ via Skills.sh) | Read compiled `AGENTS.md` / `CLAUDE.md` / `.cursor/rules/*.mdc` etc. |

See [`agent-kernel/MEMORY.md`](../agent-kernel/MEMORY.md) for the deep guide.

## Compatibility

| Agent | Memory source | Hook install | Compile target |
|---|---|---|---|
| Claude Code | ✅ | ✅ | `PreToolUse` + `PostToolUse` |
| Codex | ✅ | n/a | `AGENTS.md` |
| Cursor | ✅ | n/a | `.mdc` rule |
| OpenCode | ✅ | n/a | `AGENTS.md` |
| Antigravity | ✅ | n/a | `.agents/` |
| Gemini CLI | ✅ | n/a | `GEMINI.md` |
| 60+ via Skills.sh | ✅ | depends on agent | via `AGENTS.md` |

Storage layout is **fully backward compatible with v0.0.1** —
`agent-kernel migrate json --publish` upgrades in place.

## License

MIT — agent-kernel © Mamdouh Aboammar.

## Repository

- Bundled copy: https://github.com/imMamdouhaboammar/delegate-team/tree/master/agent-kernel
- Upstream: https://github.com/imMamdouhaboammar/agent-kernel