<div align="center">

# 🛠️ delegate-team

### *Routes coding tasks through the right agentic workflow, governed by local memory, rules, and policy checks.*

[![npm version](https://img.shields.io/npm/v/delegate-team?color=cb3837&logo=npm&label=npm&style=flat-square)](https://www.npmjs.com/package/delegate-team)
[![License: MIT](https://img.shields.io/github/license/imMamdouhaboammar/delegate-team?color=blue&style=flat-square)](./LICENSE)
[![CI status](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?label=CI&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/imMamdouhaboammar/delegate-team?style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/commits/master)

</div>

> **One CLI. One orchestrator. One optional memory + governance layer.**
> Pick what you need, skip the rest.

---

## ⚡ Pick your lane

| If you want... | Lane | What gets installed | Time |
|---|---|---|---|
| Just the `dt` CLI to dispatch tasks to backends | **[Lane 1 — `dt` CLI](#lane-1--dt-cli-only)** | npm package → `dt` on PATH | 30 s |
| `/apeiron "X"` slash command in Claude Code | **[Lane 2 — `/apeiron`](#lane-2--apeiron-in-claude-code)** | Lane 1 + orchestrator skill | 2 m |
| The full local agent OS (memory, multi-agent, governance) | **[Lane 3 — full local agent OS](#lane-3--full-local-agent-os)** | Lane 2 + MMAS + agent-kernel | 5–10 m |

**Not sure?** Most users start with Lane 1. You can always add Lane 2 / 3
later. Every install is idempotent.

See **[docs/INSTALLATION.md](./docs/INSTALLATION.md)** for the full reference.

---

## Lane 1 — `dt` CLI only

```bash
npm install -g delegate-team
dt --version          # → 3.0.7
dt run "<task>"       # dispatch with auto backend selection
dt run "<task>" --dry-run
dt doctor             # human health check
dt doctor --json      # automation-safe health check
```

**What you get:** one Node CLI. No skills, no hooks, no companion
frameworks, no network calls at runtime unless you dispatch to a configured
backend.

**Uninstall:** `npm uninstall -g delegate-team`

---

## Lane 2 — `/apeiron` in Claude Code

```bash
npm install -g delegate-team                     # Lane 1 first
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --orchestrator                      # install the skill
# Restart Claude Code so /apeiron is registered
```

Then in any Claude Code session:

```bash
/apeiron "Build a CSV → JSON CLI"
apeiron "ship v0.2.0 to npm"           # routing decision only
dt route --explain "<task>"                       # full JSON trace
dt route --last                                   # newest saved trace
```

**What you get:** the `apeiron` skill + `/apeiron` slash command +
`apeiron` CLI on PATH. No MMAS, no agent-kernel.

**Uninstall:** `./install.sh --uninstall`

---

## Lane 3 — full local agent OS

```bash
npm install -g delegate-team                     # Lane 1 first
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all --dry-run                      # preview what changes
./install.sh --all --trust-mode normal --yes      # do it
./install.sh --verify                             # confirm
```

Adds everything from Lane 2 plus:

- **MMAS**: multi-agent team runtime (Atlas + 7 specialists).
- **agent-kernel**: local memory, episodic recall, approval inbox, policy guard.
- **Companion frameworks**: superpowers, Waza, unslop-preflight, autoresearch.

Safety flags worth knowing:

| Flag | What it does |
|---|---|
| `--dry-run` | Show every write + network call without executing |
| `--no-network` | Skip `npx skills add`, `git clone`, `npm install -g` |
| `--trust-mode strict` | Disable MCP auto-load, block external downloads, print every sensitive op |
| `--trust-mode normal` | Default safe behavior |
| `--yes` | Non-interactive setup and install flows |

**Uninstall:** `./install.sh --uninstall`. Your `~/.agent-kernel/` memories
are preserved.

---

## 🚀 Quick demo

```bash
# Lane 1: inspect a task without executing it
dt run "Refactor the user model for multi-tenancy" --dry-run

# Lane 1: dispatch a task
dt run "Refactor the user model for multi-tenancy"

# Lane 2: route a task without executing
dt route --explain "make API p95 < 200ms"
# {"task":"...","detected_signals":{...},"selected_workflow":"PERFORMANCE/METRIC",...}

# Lane 3: spawn a multi-agent team with guardrails
dt mmas spawn "Audit the auth layer" \
    --team atlas,scout,reviewer,sentinel \
    --timeout 900 --max-agents 4
```

---

## 🧩 Component map

| Component | What it does | Lane | Docs |
|---|---|---|---|
| **`dt` CLI** | Dispatch tasks to backends, run the proxy, check health | 1+ | [`DT.md`](./DT.md) |
| **`/apeiron` orchestrator** | Natural-language task routing with structured traces | 2+ | [`docs/ROUTING.md`](./docs/ROUTING.md) |
| **agent-kernel** | Local memory + governance (companion) | 3 | [`docs/AGENT-KERNEL-INTEGRATION.md`](./docs/AGENT-KERNEL-INTEGRATION.md) |
| **MMAS** | Multi-agent team runtime with guardrails | 3 | [`docs/MMAS.md`](./docs/MMAS.md) |
| **Skill scaffolder** | `apeiron-skill-scaffold` CLI for new skills | 3 | [`scaffolder/`](./scaffolder/) |
| **Backend agents** | Codex, MiniMax, Gemini, MetaGPT | 3 | [`integrations/`](./integrations/) |
| **delegate-skills** | `dt delegate <agent>` — hand a task to Grok/Codex/OpenCode/Kimi/AGY, review the diff yourself | 3 | [`delegate-skills/SKILL.md`](./delegate-skills/SKILL.md) |

For the conceptual architecture, see **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

---

## 📦 Release and npm publishing

Publishing is automatic but guarded:

```bash
npm run version:check       # manifest + changelog version guard
npm install --package-lock-only
npm test
npm publish --dry-run --access public
```

The GitHub Actions publish workflow validates version sync, warns about
`package-lock.json` drift, tests the packed tarball in a temporary project,
blocks secret-like files, publishes with provenance, verifies npm registry
state, and creates the matching Git tag/release when publishing from `master`.

Trusted Publishing with npm OIDC is preferred. `NPM_TOKEN` is treated as a
fallback while npm-side Trusted Publisher settings are being configured.

---

## 🛡️ Safety

delegate-team runs AI agents on your local machine under your user account.
It has built-in guards for the common risks:

- Workspace sandboxing (`DT_WORKSPACE_ROOT`)
- Command allowlist (override with `DT_ALLOW_UNSAFE_COMMANDS=true`)
- Supply chain guard (override with `DT_ALLOW_DEP_INSTALL=true`)
- MCP auto-load is **off by default** (`DT_ENABLE_MCP=true` to opt in)
- Proxy local-only bind to `127.0.0.1`
- Proxy auth token check and configurable `DT_PROXY_MAX_BODY`
- MMAS subprocess guardrails (max agents, timeouts, plan-only, kill switch)
- agent-kernel policy guard (pre-commit + Claude `PreToolUse` hooks)

Full threat model + opt-in switches: **[docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md)**.

---

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [docs/INSTALLATION.md](./docs/INSTALLATION.md) | Lane-by-lane install + verify + uninstall |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 5-layer mental model, data flow, boundaries |
| [docs/ROUTING.md](./docs/ROUTING.md) | How the orchestrator picks a verdict |
| [docs/WORKFLOWS.md](./docs/WORKFLOWS.md) | Real examples per verdict |
| [docs/AGENT-KERNEL-INTEGRATION.md](./docs/AGENT-KERNEL-INTEGRATION.md) | Memory + governance boundary contract |
| [docs/MMAS.md](./docs/MMAS.md) | Multi-agent runtime + guardrails |
| [docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md) | Threat model + opt-in switches |
| [INSTALL.md](./INSTALL.md) | Granular component-level install detail |
| [DT.md](./DT.md) | Original `dt` CLI specifics |
| [CHANGELOG.md](./CHANGELOG.md) | v1.0.0 → v3.0.7 release notes |
| [SECURITY.md](./SECURITY.md) | Short vulnerability-reporting policy |
| [AGENTS.md](./AGENTS.md) | Repo conventions for contributors |
| [docs/audits/REPO-AUDIT-vNEXT.md](./docs/audits/REPO-AUDIT-vNEXT.md) | Historical audit baseline |

---

## 📊 Project status

| Workflow | Status | Purpose |
|---|---|---|
| CI | [![CI](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?label=CI&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml) | Build, typecheck, test, routing matrix, manifest validation |
| npm publish | [![npm publish](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/npm-publish.yml?label=npm&logo=npm&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/npm-publish.yml) | Version guard, tarball smoke test, provenance publish, npm verify |
| Release | [![auto-release](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/release.yml?label=auto-release&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/release.yml) | GitHub Release + tarball |

| Backend | Maturity | Notes |
|---|---|---|
| Codex (via `god-agent`) | Stable | opencode dispatcher |
| MiniMax (via `mmx`) | Stable | `minimax-coder/` |
| Gemini (via `google-genai`) | Stable | `vertex-coder/` |
| MetaGPT team | Experimental | multi-role team runner |

| Component | Maturity | Notes |
|---|---|---|
| `dt` CLI | Stable | npm package |
| `/apeiron` orchestrator | Stable | bash + Skills.sh skill |
| agent-kernel (vendored v0.0.5) | Stable | companion memory + governance |
| MMAS multi-agent | Beta | runtime + guardrails |

---

## 🤝 Contributing

1. Read **[AGENTS.md](./AGENTS.md)** for repo conventions.
2. Make a feature branch: `git switch -c feat/your-change`.
3. Run CI locally:

   ```bash
   npm ci
   npm run version:check
   npm run typecheck
   npm test
   bash -n install.sh
   bash -n orchestrator/scripts/orchestrate.sh
   python -m py_compile mmas/spawn-team.py mmas/hash-edit.py
   python -m json.tool < .claude-plugin/marketplace.json > /dev/null
   ```

4. Open a PR. CI runs the same checks on GitHub Actions runners.
