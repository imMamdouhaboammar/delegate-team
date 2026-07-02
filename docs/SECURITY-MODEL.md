# Security Model

> **TL;DR**: delegate-team runs AI agents on your local machine. It has built-in
> guards for the common risks (workspace escape, command injection, supply
> chain, prompt injection, MCP auto-load) and exposes opt-in switches for the
> rest. Read this doc before running on a shared machine or in CI.

For installation-level safety (dry-run, no-network, trust modes), see
[INSTALLATION.md](./INSTALLATION.md#safety-notes) and the installer flags.

---

## Threat model

`delegate-team` is an AI agent orchestration tool. It executes code and
terminal commands on the local machine under your user account. The threats we
care about (mapped to OWASP LLM Top 10):

| Risk | Example |
|---|---|
| LLM01 — Prompt injection via skills | A malicious `SKILL.md` injecting system instructions |
| LLM04 — Secrets management | API keys leaked in logs or stderr |
| LLM05 — Supply chain | `npm install <untrusted>` or `curl ... | sh` |
| LLM07 — Insecure plugin design | MCP server with arbitrary code execution |
| LLM08 — Excessive agency | Agent `rm -rf /` because the prompt asked for "cleanup" |

Plus operational risks specific to multi-agent and orchestrator systems:

| Risk | Example |
|---|---|
| Subprocess runaway | MMAS spawning 50 agents and exhausting the host |
| Filesystem escape | Agent writing to `~/.ssh/authorized_keys` |
| Network exfiltration | Agent `curl https://attacker.example` after a prompt |
| Lifecycle leak | Watchdog leaving zombie subprocesses |

---

## Built-in guards

### 1. Workspace sandboxing (mitigates LLM08)

The `vertex-coder` agent tools (`read_file`, `write_file`, `list_dir`,
`grep_search`, `line_replace`) are bound to `DT_WORKSPACE_ROOT` (or the
current working directory). Access to sensitive paths — `.env`, `~/.ssh`,
`~/.config` — is blocked unless explicitly overridden.

Override (dangerous): `DT_WORKSPACE_ESCAPE=1`.

### 2. Command allowlist (mitigates OS command injection + LLM08)

The `run_command` tool enforces a strict allowlist of safe commands
(`npm test`, `git status`, etc.). Destructive operations (`rm -rf /`,
unlisted binaries) require:

```bash
export DT_ALLOW_UNSAFE_COMMANDS=true
```

The model cannot set this itself. A human must export it.

### 3. Supply chain guard (mitigates LLM05)

The `add_dependency` tool blocks:

- Direct tarball / zip URLs.
- Local path references (`../pkg`).
- Editable installs.
- `npm install` without `--ignore-scripts`.

Installing any package requires:

```bash
export DT_ALLOW_DEP_INSTALL=true
```

### 4. Untrusted skills (mitigates LLM01)

Global skills (`SKILL.md`) loaded from external directories are treated as
untrusted. They cannot inject system instructions or appear in the agent's
context without one of:

- An entry in the explicit allowlist.
- The `DT_APPROVE_UNTRUSTED=true` environment variable.

### 5. Proxy hardening (mitigates LLM04)

The local LLM gateway (`dt serve`):

- Binds to `127.0.0.1` only.
- Requires a proxy token (auto-generated on first run).
- Strict CORS allowing only explicit localhost UI ports.
- 2 MB request body size limit (configurable via `DT_PROXY_MAX_BODY`).
- Automatic log redaction for API keys and Bearer tokens.

### 6. MCP process security (mitigates LLM07)

By default, `dt` does **not** auto-load MCP servers from `mcp_config.json`.
This blocks a malicious config file from triggering arbitrary remote code
execution via `subprocess.Popen`.

To opt in:

```bash
export DT_ENABLE_MCP=true
```

### 7. Dynamic authentication

`dt` avoids hardcoded keys in `.env` files. It uses dynamic CLI auth
(`gcloud auth print-access-token`) and caches config at
`~/.config/dt/config.json` with `0600` permissions.

---

## Installer-level safety (added in v2.6.0)

The bootstrap script (`install.sh`) now supports safety modes:

| Flag | What it does |
|---|---|
| `--dry-run` | Prints every write + network call without making it |
| `--no-network` | Skips `npx skills add`, `git clone`, and any `npm install -g` |
| `--trust-mode strict` | Disables MCP auto-load, blocks external downloads, prints every sensitive op |
| `--trust-mode normal` | Current safe default |
| `--trust-mode dev` | Allows local development shortcuts; prints warnings |
| `--yes` | Non-interactive approval for CI |

See [INSTALLATION.md](./INSTALLATION.md#lane-3--full-local-agent-os) for
usage.

### What the installer touches

On a Lane 3 install (`./install.sh --all`), the installer may:

- Write to `~/.mavis/skills/`, `~/.mavis/agents/`, `~/.mavis/bin/`
- Symlink to `~/.claude/commands/`, `~/.claude/skills/`, `~/.claude/hooks/`
- Symlink to `~/.local/bin/` and `~/bin/`
- Create `~/.agent-kernel/` (kernel-managed)
- Run `npx skills add <third-party>` for companion frameworks
- Run `npm install -g` for unslop-preflight

`--no-network` blocks the last two. `--dry-run` shows all of them without
doing them.

---

## MMAS-level safety

The multi-agent runtime adds subprocess-spawning risk. See [MMAS.md](./MMAS.md)
for full details. Highlights:

| Guard | Default | Override |
|---|---|---|
| Max agents | 4 | `--max-agents <N>` (hard cap 8) |
| Per-agent timeout | 900 s | `--timeout <seconds>` |
| Write mode | `workspace` | `--no-write`, `--logs-only` |
| Watchdog interval | 30 s | `--interval <seconds>` |
| Kill switch | manual | `spawn-team.py stop <task_id>` |

A task that times out is `SIGTERM`'d, then `SIGKILL`'d after a 5-second grace
period. The watchdog never leaves zombie subprocesses.

---

## agent-kernel-level safety

The kernel adds a deterministic policy guard. It runs as a `pre-commit` hook
and as a Claude `PreToolUse` hook. It blocks:

- `rm -rf` outside the workspace.
- `curl ... | sh`.
- Force-push to `main` / `master`.
- Any file containing what looks like a leaked secret (heuristic).

You can add your own rules in `~/.agent-kernel/source/memories/` — see
[AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md).

---

## Reporting a vulnerability

Email `maintainers@delegate-team.dev` or open a private security advisory on
GitHub. Do **not** open a public issue for suspected vulnerabilities.

---

## What we do NOT do

- We do not run delegate-team as a network service by default.
- We do not auto-load untrusted skills.
- We do not auto-load MCP servers.
- We do not auto-install companion frameworks without `--all`.
- We do not write to `~/.ssh/`, `~/.aws/`, or `~/.config/` unless you
  explicitly enable workspace escape.

If any of those defaults changes, it will be a major version bump.

---

## Quick reference

```bash
# Maximum safety (offline, dry-run)
./install.sh --all --dry-run --no-network --trust-mode strict

# Recommended for shared machines
./install.sh --all --trust-mode strict --yes

# CI / scripted
./install.sh --all --trust-mode normal --yes --no-network

# Local development
./install.sh --all --trust-mode dev --yes

# Inspect what the orchestrator would do
mavis-orchestrate "<task>"
dt route --explain "<task>"

# Kill a runaway MMAS run
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py stop <task_id>
```