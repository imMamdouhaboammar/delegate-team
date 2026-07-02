# `dt` CLI — Delegation Gateway

> This is the ORIGINAL product of this repo. The supersystem v2 release added
> the orchestrator, scaffolder, MMAS, and integrations on top — but `dt` itself
> is unchanged.

`dt` is a local CLI that lets Claude Code delegate coding tasks to specialized
agent backends. It can route a task to:

- **VertexCoder** — Gemini family (`gemini-3.1-pro`, `gemini-3.5-flash`)
- **Codex** — `codex-gpt-5.5-high` via the `codex` CLI
- **MiniMax** — `MiniMax-M3`, `M2.7`, `M2.7-highspeed` via `mmx` CLI
- **OpenCode** — `opencode-glm-5.2-max`, `opencode-qwen-max`, `opencode-kimi-k2.7-code-max`
- **MetaGPT-style team** — multi-role composition

While keeping Claude Code (or the human) as the final reviewer.

## What `dt` is

- A local delegation gateway for AI coding agents.
- A routing layer between Claude Code and multiple coding backends.
- A policy layer for budgets, workspace boundaries, failover, and review.
- A MetaGPT-style team runner for complex tasks.

## What `dt` is not

- Not a replacement for Claude Code.
- Does not commit code automatically.
- Does not guarantee every backend is available.
- Does not make untrusted agent output safe without review.

## Core features

| Feature | Description |
|---|---|
| **Failover ring** | `dt` attempts best-effort fallback across configured backends. If another backend is available, `dt` can retry the task automatically. |
| **Lean Token Protocol** | A targeted, compact contract. The routing engine minimizes file ingestion size, feeding only the context that actually matters. |
| **Autopilot setup** | `dt setup` creates local Python virtual environments and checks cloud credentials. |
| **Dynamic auth** | Zero hardcoded keys. `dt` queries your active local sessions and safely stores configurations locally. |
| **Skill linker** | Instantly injects `dt`'s orchestrators directly into local Claude Code and Gemini CLI paths. |

## Build

```bash
npm install
npm run build
./install.sh --dt
```

## Usage

```bash
dt run "<task>"                           # Auto-routing + failover
dt run "<task>" --backend minimax-coder   # Force a specific backend
dt run "<task>" --team                    # MetaGPT-style multi-role

dt setup                                  # First-time setup
dt doctor                                 # Health check
```

## Architecture

Unlike standard tools that just "support MetaGPT" or fire prompts at an API,
`dt` introduces a **supervised delegation runtime**:

```
[Claude Code]  ─→  [dt gateway]  ─→  [vertex-coder / god-agent / minimax-coder / metagpt / fallback]
                          │
                          ↓ review
                  [human user / Claude Code]
```

See:
- `DELEGATION_PROTOCOL.md` — Lean Token Protocol specification
- `ROLE_ROUTING.md` — How tasks get routed across roles
- `SECURITY.md` — Auth + scope policy
- `TRACE_SCHEMA.md` — Telemetry + observability
- `AGENT_ACCESS_GUIDE.md` — How agents access this repo

## Compatibility with supersystem v2

`dt` is the execution engine referenced by:

- `/mavis-ship` orchestrator (when the routed stage is "heavy multi-file")
- `/delegate-team` slash command (in any Claude Code session)

Both automatically discover `dt` once it's built and on PATH.
