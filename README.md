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
| `/mavis-ship "X"` slash command in Claude Code | **[Lane 2 — `/mavis-ship`](#lane-2--mavis-ship-in-claude-code)** | Lane 1 + orchestrator skill | 2 m |
| The full local agent OS (memory, multi-agent, governance) | **[Lane 3 — full local agent OS](#lane-3--full-local-agent-os)** | Lane 2 + MMAS + agent-kernel | 5–10 m |

**Not sure?** Most users start with Lane 1. You can always add Lane 2 / 3
later — every install is idempotent.

See **[docs/INSTALLATION.md](./docs/INSTALLATION.md)** for the full reference.

---

## Lane 1 — `dt` CLI only

```bash
npm install -g delegate-team
dt --version          # → 2.6.0
dt run "<task>"       # dispatch with auto backend selection
dt doctor             # health check
```

**What you get:** one Node CLI. No skills, no hooks, no companion
frameworks, no network calls at runtime.

**Uninstall:** `npm uninstall -g delegate-team`

---

## Lane 2 — `/mavis-ship` in Claude Code

```bash
npm install -g delegate-team                     # Lane 1 first
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --orchestrator                      # install the skill
# Restart Claude Code so /mavis-ship is registered
```

Then in any Claude Code session:

```bash
/mavis-ship "Build a CSV → JSON CLI"
mavis-orchestrate "ship v0.2.0 to npm"           # routing decision only
dt route --explain "<task>"                       # full JSON trace
```

**What you get:** the `mavis-ship` skill + `/mavis-ship` slash command +
`mavis-orchestrate` CLI on PATH. No MMAS, no agent-kernel.

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

- **MMAS** — multi-agent team runtime (Atlas + 7 specialists).
- **agent-kernel** — local memory, episodic recall, approval inbox, policy guard.
- **Companion frameworks** — superpowers, Waza, unslop-preflight, autoresearch.

Safety flags worth knowing:

| Flag | What it does |
|---|---|
| `--dry-run` | Show every write + network call without executing |
| `--no-network` | Skip `npx skills add`, `git clone`, `npm install -g` |
| `--trust-mode strict` | Disable MCP auto-load, block external downloads, print every sensitive op |
| `--trust-mode normal` | Default — current safe behavior |
| `--yes` | Non-interactive (for CI) |

**Uninstall:** `./install.sh --uninstall`. Your `~/.agent-kernel/` memories
are preserved.

---

## 🚀 Quick demo

```bash
# Lane 1: dispatch a task
dt run "Refactor the user model for multi-tenancy"

# Lane 2: route a task without executing
mavis-orchestrate "Build a pricing page with shadcn components"
# UI DELIVERY path — unslop audit is BLOCKING before /delegate-team.

# Lane 2: full JSON trace
dt route --explain "make API p95 < 200ms"
# {"task":"...","detected_signals":{...},"selected_workflow":"PERFORMANCE/METRIC",...}

# Lane 3: spawn a multi-agent team (with guardrails)
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py \
    "Audit the auth layer" \
    --team atlas,scout,reviewer,sentinel \
    --timeout 900 --max-agents 4
```

---

## 🧩 Component map

| Component | What it does | Lane | Docs |
|---|---|---|---|
| **`dt` CLI** | Dispatch tasks to backends, run the proxy, check health | 1+ | [`DT.md`](./DT.md) |
| **`/mavis-ship` orchestrator** | Natural-language task routing with structured traces | 2+ | [`docs/ROUTING.md`](./docs/ROUTING.md) |
| **agent-kernel** | Local memory + governance (companion) | 3 | [`docs/AGENT-KERNEL-INTEGRATION.md`](./docs/AGENT-KERNEL-INTEGRATION.md) |
| **MMAS** | Multi-agent team runtime with guardrails | 3 | [`docs/MMAS.md`](./docs/MMAS.md) |
| **Skill scaffolder** | `mavis-skill-scaffold` CLI for new skills | 3 | [`scaffolder/`](./scaffolder/) |
| **Backend agents** | Codex, MiniMax, Gemini, MetaGPT — installed with Lane 3 | 3 | [`integrations/`](./integrations/) |

For the conceptual architecture (what each layer is and what it is not),
see **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

---

## 🛡️ Safety

delegate-team runs AI agents on your local machine under your user account.
It has built-in guards for the common risks:

- Workspace sandboxing (`DT_WORKSPACE_ROOT`)
- Command allowlist (override with `DT_ALLOW_UNSAFE_COMMANDS=true`)
- Supply chain guard (override with `DT_ALLOW_DEP_INSTALL=true`)
- MCP auto-load is **off by default** (`DT_ENABLE_MCP=true` to opt in)
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
| [INSTALL.md](./INSTALL.md) | Granular component-level install (Lane 2 / 3 detail) |
| [DT.md](./DT.md) | Original `dt` CLI specifics |
| [CHANGELOG.md](./CHANGELOG.md) | v1 → v2.5 release notes |
| [SECURITY.md](./SECURITY.md) | Short vulnerability-reporting policy |
| [AGENTS.md](./AGENTS.md) | Repo conventions for contributors |
| [docs/audits/REPO-AUDIT-vNEXT.md](./docs/audits/REPO-AUDIT-vNEXT.md) | Pre-refactor audit (v2.6.0 baseline) |

---

## 📊 Project status

| Workflow | Status | Purpose |
|---|---|---|
| CI | [![CI](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?label=CI&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml) | Build, typecheck, test, routing matrix, manifest validation |
| npm publish | [![npm publish](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/npm-publish.yml?label=npm&logo=npm&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/npm-publish.yml) | Auto-publish on `v*` tag with OIDC provenance |
| Release | [![auto-release](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/release.yml?label=auto-release&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/release.yml) | GitHub Release + tarball |

| Backend | Maturity | Notes |
|---|---|---|
| Codex (via `god-agent`) | Stable | opencode dispatcher |
| MiniMax (via `mmx`) | Stable | `minimax-coder/` |
| Gemini (via `google-genai`) | Stable | `vertex-coder/` |
| MetaGPT team | Experimental | `metagpt/` — multi-role team runner |

| Component | Maturity | Notes |
|---|---|---|
| `dt` CLI | Stable | npm package, ~21 KB tarball |
| `/mavis-ship` orchestrator | Stable | bash + Skills.sh skill |
| agent-kernel (vendored v0.0.5) | Stable | companion memory + governance |
| MMAS multi-agent | Beta | runtime + guardrails (v2.6.0) |

---

## 🤝 Contributing

1. Read **[AGENTS.md](./AGENTS.md)** for repo conventions.
2. Make a feature branch: `git switch -c feat/your-change`.
3. Run CI locally:

   ```bash
   bash -n install.sh
   bash -n orchestrator/scripts/orchestrate.sh
   python -m py_compile mmas/spawn-team.py mmas/watchdog.sh 2>/dev/null || python -m py_compile mmas/spawn-team.py mmas/hash-edit.py
   python -m json.tool < .claude-plugin/marketplace.json > /dev/null
   ```

4. Open a PR — CI runs the same checks on GitHub Actions runners.

Adding a new sub-skill? Use the scaffolder:

```bash
mavis-skill-scaffold --name my-new-skill --description "..." --type workflow
```

---

## 🛣️ Roadmap

- [x] **v2.0.0** — supersystem release
- [x] **v2.1.0** — Skills.sh + Claude Code marketplace compatibility
- [x] **v2.1.1** — orchestrate.sh regex routing fixes
- [x] **v2.2.0** — Polished README + expanded CI
- [x] **v2.3.0** — npm package live + auto-publish
- [x] **v2.4.0** — Polished README layout (distributed badges)
- [x] **v2.5.0** — Bundled agent-kernel + memory stage in orchestrator
- [x] **v2.5.1** — BundlePhobia Rspack fix in `dt` build path
- [x] **v2.6.0** — Clarity + safety release: `docs/` split, installer safety modes, routing traces, MMAS guardrails, agent-kernel boundary commands
- [ ] **v2.6.1** — follow-ups from v2.6.0 (see CHANGELOG)
- [ ] **v3.0.0** — multi-tenant team runs + per-project skill isolation

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

---

## 💖 Acknowledgments

Built on top of:

- [obra/superpowers](https://github.com/obra/superpowers) — methodology layer
- [tw93/Waza](https://github.com/tw93/Waza) — 8-skills framework
- [uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch) — metric loop
- [imMamdouhaboammar/unslop-preflight](https://github.com/imMamdouhaboammar/unslop-preflight) — UI quality gate
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — registry infrastructure
- [imMamdouhaboammar/agent-kernel](https://github.com/imMamdouhaboammar/agent-kernel) — vendored memory + governance

---

<div align="center">

<sub>If this repo saved you time, [star it ⭐](https://github.com/imMamdouhaboammar/delegate-team) or
[open an issue](https://github.com/imMamdouhaboammar/delegate-team/issues/new).</sub>

<sub>Built by <strong>Mamdouh Aboammar</strong> · Cairo, Egypt 🇪🇬</sub>

</div>