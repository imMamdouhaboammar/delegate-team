# `dt` CLI - Delegation Gateway

> This is the original product of this repo. The supersystem v2 release added
> the orchestrator, scaffolder, MMAS, and integrations on top. `dt` remains the
> low-level execution gateway.

`dt` is a local CLI that lets Claude Code, scripts, or a human operator route
coding tasks to specialized agent backends. It can route a task to:

- **VertexCoder**: Gemini family via Google SDK / Vertex path.
- **Codex**: Codex CLI path.
- **MiniMax**: MiniMax backends via `mmx` / adapter CLIs.
- **OpenCode**: OpenCode-routed models.
- **MetaGPT-style team**: multi-role composition for complex tasks.

Claude Code or the human remains the final reviewer.

## What `dt` is

- A local delegation gateway for AI coding agents.
- A routing layer between a task and multiple coding backends.
- A policy layer for workspace boundaries, failover, and review.
- A setup helper for local config, credentials, and backend health checks.

## What `dt` is not

- Not a replacement for Claude Code.
- Does not commit code automatically.
- Does not guarantee every backend is available.
- Does not make untrusted agent output safe without review.

## Core features

| Feature | Description |
|---|---|
| **Failover ring** | Attempts best-effort fallback across configured backends. |
| **Dry-run dispatch** | `dt run "<task>" --dry-run` prints backend choice and fallback chain without executing. |
| **JSON doctor** | `dt doctor --json` emits machine-readable backend health for scripts and CI. |
| **Autopilot setup** | `dt setup` creates local Python virtual environments and writes local config. |
| **Non-interactive setup** | `dt setup --project <id> --skip-auth --skip-gcp-enable --skip-provision --yes`. |
| **Dynamic auth** | No hardcoded keys. Config files are local and written with private permissions. |
| **Skill linker** | Symlinks orchestrators into local Claude Code and Gemini CLI paths. |

## Build

```bash
npm ci
npm run version:check
npm run build
./install.sh --dt
```

## Usage

```bash
dt run "<task>"                         # auto-routing + failover
dt run "<task>" --dry-run               # inspect plan only
dt run "<task>" --backend minimax       # force a backend
dt run "<task>" --team                  # MetaGPT-style team route

dt setup                                # interactive first-time setup
dt setup --project my-project --skip-auth --skip-gcp-enable --skip-provision --yes

dt doctor                               # human health check
dt doctor --json                        # automation-safe health check

dt route --explain "<task>"             # routing trace
dt route --last                         # newest saved trace
```

## Architecture

Unlike tools that only fire prompts at an API, `dt` introduces a supervised
delegation runtime:

```
[Claude Code / human / script] -> [dt gateway] -> [vertex-coder / god-agent / minimax-coder / metagpt / fallback]
                                      |
                                      v
                              [review surface]
```

## Local config and permissions

`dt setup` writes:

- `~/.config/dt/config.json` with `0600`
- `~/.metagpt/config2.yaml` with `0600`
- containing directories with `0700`

The local proxy binds to `127.0.0.1` and requires a proxy token.

## Compatibility with supersystem v2

`dt` is the execution engine referenced by:

- `/apeiron` orchestrator when the routed stage needs backend execution.
- `/delegate-team` slash command in Claude Code.
- MMAS when specialist agents delegate implementation or review tasks.

Both automatically discover `dt` once it is built and on PATH.

## See also

- `docs/INSTALLATION.md`: lane-based install and release checks.
- `docs/ARCHITECTURE.md`: layer map and trust boundaries.
- `docs/SECURITY-MODEL.md`: local security model.
- `docs/MMAS.md`: multi-agent runtime.
