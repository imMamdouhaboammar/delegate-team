<div align="center">

# 🛠️ delegate-team

### *One command runs the full engineering chain.*

```text
/mavis-ship "Make API p95 < 200ms"
```

**Waza `/think` → unslop audit → superpowers writing-plans →**
**autoresearch | `/delegate-team` | `/mavis-team` → Waza `/check` → quality-guard → SHIP**

[![npm version](https://img.shields.io/npm/v/delegate-team?color=cb3837&logo=npm&label=npm&style=for-the-badge)](https://www.npmjs.com/package/delegate-team)
[![npm downloads](https://img.shields.io/npm/dm/delegate-team?color=cb3837&logo=npm&style=for-the-badge)](https://www.npmjs.com/package/delegate-team)
[![Version](https://img.shields.io/github/v/release/imMamdouhaboammar/delegate-team?color=blue&label=version&style=for-the-badge)](https://github.com/imMamdouhaboammar/delegate-team/releases)
[![License: MIT](https://img.shields.io/github/license/imMamdouhaboammar/delegate-team?style=for-the-badge&color=blue)](https://github.com/imMamdouhaboammar/delegate-team/blob/master/LICENSE)
[![Stars](https://img.shields.io/github/stars/imMamdouhaboammar/delegate-team?style=for-the-badge&logo=github)](https://github.com/imMamdouhaboammar/delegate-team/stargazers)
[![CI](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?branch=master&style=for-the-badge&label=CI)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml)
[![npm publish](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/npm-publish.yml?style=for-the-badge&label=npm%20publish&logo=npm)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/npm-publish.yml)
[![Skills.sh](https://img.shields.io/badge/dynamic/json?color=blueviolet&label=Skills.sh&query=%24.rank&url=https%3A%2F%2Fskills.sh%2Fapi%2Frank%2FimMamdouhaboammar%2Fdelegate-team&style=for-the-badge)](https://skills.sh/imMamdouhaboammar/delegate-team)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Bash](https://img.shields.io/badge/Bash-4%2B-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://www.gnu.org/software/bash/)

</div>

> **The complete agentic engineering supersystem.** One open-source repo. Six
> components. Four routing layers. One **(`/mavis-ship "<task>")** command that
> orchestrates them all. Built on top of superpowers, Waza, unslop-preflight,
> and autoresearch. Designed to work with Claude Code, Codex, Cursor, Copilot,
> Windsurf, Gemini CLI, OpenCode, and 60+ more coding agents via Skills.sh.

---

## ⚡ What is this?

**delegate-team** is the bridge between a natural-language request and a
multi-model, multi-stage engineering pipeline. Instead of picking tools by hand,
type one command and let the supersystem decide:

| Without delegate-team | With delegate-team |
|---|---|
| Pick a model → craft a prompt → wait → review → fix the prompt → repeat | `/mavis-ship "X"` and watch the chain run |
| Architect **or** implement **or** review per turn | Brainstorm → plan → TDD → execute → verify → ship |
| Each agent works alone | 8 specialized agents (Atlas / Forge / Scout / Oracle / Librarian / Reviewer / Visionary / Sentinel) collaborate |
| "Best practice" depends on which LLM answered | Methodology encoded as skills: superpowers · Waza · unslop-preflight · autoresearch |

**Sounds good? Try it:**

```bash
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all
./install.sh --verify   # sanity check
```

---

## 📦 Quick install

**Four installation paths. Pick your favorite.**

### Path A — npm (the fastest — just the `dt` CLI)

```bash
# Global install (preferred for a CLI on your PATH)
npm install -g delegate-team
dt --version      # → 2.2.0
dt run "<task>"

# Or run without installing
npx delegate-team --help
```

Releases auto-publish from the `npm-publish.yml` GitHub Action on every `v*` tag push.

### Path B — Skills.sh CLI (skill discovery + global install)

```bash
npx skills add imMamdouhaboammar/delegate-team -a claude-code -g -y
```

This installs all 8 sub-skills to your Claude Code (or any of 68 supported agents)
and makes `delegate-team`, `mavis-ship`, `mmas`, `skill-scaffold`, `dt`, etc.
all invocable by name.

### Path C — Claude Code marketplace (native plugin install)

```bash
/plugin marketplace add imMamdouhaboammar/delegate-team
/plugin install delegate-team@delegate-team
```

### Path D — Bootstrap script (everything, including companion frameworks)

```bash
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all            # everything
./install.sh --orchestrator   # just /mavis-ship
./install.sh --mmas           # just the multi-agent framework
./install.sh --integrations   # just companion frameworks
./install.sh --verify         # check what's installed
```

After install, every component is idempotent and verifiable.

---

## 🧩 Components

| Component | Path | Language | Status | What it does |
|---|---|---|---|---|
| **dt CLI** | [`src/`](./src), [`dist/`](./dist) | ![TypeScript](https://img.shields.io/badge/TS-5.6-3178C6?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | Delegation gateway with policy + failover + MetaGPT teams |
| **`/mavis-ship`** | [`orchestrator/`](./orchestrator/) | ![Bash](https://img.shields.io/badge/Bash-4+-4EAA25?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | Single-command orchestrator with regex routing |
| **Skill scaffolder** | [`scaffolder/`](./scaffolder/) | ![Bash](https://img.shields.io/badge/Bash-4+-4EAA25?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | `mavis-skill-scaffold` generator |
| **MMAS** | [`mmas/`](./mmas/) | ![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square) | ![Beta](https://img.shields.io/badge/beta-yellow?style=flat-square) | 8-agent multi-agent team framework |
| **God Agent** | [`god-agent/`](./god-agent/) | ![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | Codex + opencode dispatcher |
| **MiniMax Coder** | [`minimax-coder/`](./minimax-coder/) | ![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | MiniMax via `mmx` CLI |
| **Vertex Coder** | [`vertex-coder/`](./vertex-coder/) | ![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square) | ![Stable](https://img.shields.io/badge/stable-success?style=flat-square) | Gemini via google-genai |
| **MetaGPT team** | [`metagpt/`](./metagpt/) | ![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square) | ![Experimental](https://img.shields.io/badge/experimental-orange?style=flat-square) | Multi-role team runner |

### Companion frameworks (separate install, see [`integrations/`](./integrations/))

| Framework | Stars | What it adds |
|---|---|---|
| [superpowers](https://github.com/obra/superpowers) | ![242k](https://img.shields.io/github/stars/obra/superpowers?style=flat-square&color=yellow) | Methodology — 14 skills, brainstorm-first hard gate |
| [Waza](https://github.com/tw93/Waza) | ![6.1k](https://img.shields.io/github/stars/tw93/Waza?style=flat-square&color=yellow) | Entry-point — 8 habits-engineering skills |
| [unslop-preflight](https://github.com/imMamdouhaboammar/unslop-preflight) | ![New](https://img.shields.io/badge/new-ff69b4?style=flat-square) | UI quality gate — 23 reasoning gates |
| [autoresearch](https://github.com/uditgoenka/autoresearch) | ![Popular](https://img.shields.io/badge/popular-brightgreen?style=flat-square) | Metric-driven iteration loop |

---

## 🔁 The /mavis-ship chain (how it works)

Type one command. The orchestrator inspects the task and routes through the
right stages.

```text
                ┌─────────────────────────────────┐
                │  /mavis-ship "<your task>"     │
                └─────────────┬───────────────────┘
                              │
                ┌─────────────▼───────────────────┐
                │  Waza /think                   │  pressure-test + design
                │  ─────────────────────────────  │  (NEVER skip — hard gate)
                └─────────────┬───────────────────┘
                              │
                ┌─────────────▼───────────────────┐
                │  unslop audit (BLOCKING)        │  score ≥70 to proceed
                │  ─────────────────────────────  │  for UI tasks only
                └─────────────┬───────────────────┘
                              │
                ┌─────────────▼───────────────────┐
                │  superpowers writing-plans      │  plan with checkpoints
                │  ─────────────────────────────  │
                └─────────────┬───────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
   ┌───▼──────────┐    ┌──────▼──────┐    ┌──────────▼────────┐
   │ autoresearch │    │ /delegate-  │    │ /mavis-team       │
   │  plan + loop │    │   team      │    │  MMAS (Atlas+)   │
   │  metric-driven│    │  multi-model│    │  parallel agents │
   └──────┬───────┘    └──────┬──────┘    └────────┬──────────┘
          │                  │                    │
       ┌──▼──────────────────▼────────────────────▼────────┐
       │  Waza /check  →  quality-guard (Mavis)  → SHIP   │
       │  review + 5-layer pre-delivery check             │
       └──────────────────────────────────────────────────┘
```

**Routing logic** (live in [`orchestrator/scripts/orchestrate.sh`](./orchestrator/scripts/orchestrate.sh)):

| Task signature | Route |
|---|---|
| Has measurable metric (e.g. "p95 < 200ms") | autoresearch loop |
| UI task (frontend, page, modal, shadcn) | unslop BLOCKING → /delegate-team |
| Multi-agent signals (squad, spawn team, swarm) | /mavis-team MMAS |
| Bug / broken / failing | systematic-debugging → /delegate-team |
| Heavy multi-file / refactor / migrate | /delegate-team |
| Research / understand / learn | Waza /read + /learn |
| Trivial (rename, bump) | handle locally, skip chain |

---

## 🚀 Usage

### Slash command (in any Claude Code session)

```bash
/mavis-ship "Build a CLI to convert CSV to JSON"
/mavis-ship "The mobile header is rendering wrong on Safari iOS 17"
/mavis-ship "Make API p95 < 200ms"
/mavis-ship "Design the auth flow before I implement it"
```

### CLI router (shell — returns routing decision without execution)

```bash
mavis-orchestrate "Build a landing page with shadcn components"
```

Output:
```
# /mavis-ship route for: "Build a landing page with shadcn components"

Stages (descending score):
  • unslop audit (UI gate)        (score=3)
  • /think (Waza)                 (score=2)
  • /delegate-team (multi-model)  (score=1)
  • /check (Waza)                 (score=2)
  • quality-guard (Mavis)         (score=2)

# Verdict:
UI DELIVERY path — unslop audit is BLOCKING before /delegate-team.
```

### dt CLI (low-level delegation)

```bash
dt run "Refactor the user model for multi-tenancy"
dt run "<task>" --backend minimax-coder      # force a specific backend
dt run "<task>" --team                       # MetaGPT-style multi-role
dt setup                                     # first-time setup
dt doctor                                    # health check
```

### Multi-agent team (MMAS — boss mode)

```bash
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas
# Atlas autonomously picks team composition based on the task signature
```

---

## 🏗️ Architecture

```
                  ┌────────────────────────────────────┐
                  │       USER TASK (natural lang)     │
                  └──────────────────┬─────────────────┘
                                     │
                  ┌──────────────────▼─────────────────┐
                  │   /mavis-ship orchestrator          │
                  │   (orchestrator/SKILL.md)           │
                  └─────┬───────────────┬───────────────┘
                        │               │
            ┌───────────▼──┐    ┌───────▼─────────┐
            │  Methodology │    │   Execution     │
            │  ─────────── │    │   ────────────  │
            │  Waza        │    │  /delegate-team │
            │  superpowers │    │  /mavis-team    │
            │  unslop      │    │  autoresearch   │
            │              │    │   (each routes  │
            │              │    │    to a back-   │
            │              │    │    end agent)   │
            └──────────────┘    └─────────┬───────┘
                                         │
                ┌────────────────────────┼────────────────────┐
                │                        │                    │
         ┌──────▼──────┐         ┌───────▼─────┐      ┌──────▼──────┐
         │  God Agent  │         │  MiniMax    │      │  Vertex     │
         │  codex /    │         │  Coder      │      │  Coder      │
         │  opencode   │         │  mmx CLI    │      │  Gemini     │
         └─────────────┘         └─────────────┘      └─────────────┘

                  ┌────────────────────────────────────┐
                  │   VERIFICATION (Waza /check)       │
                  │   + quality-guard 5-layer check    │
                  └────────────────────────────────────┘
```

---

## ❓ Why not just use...?

| Comparison | Use this when |
|---|---|
| `autoresearch` alone | You have ONE measurable metric + bounded scope. Skip the planning. |
| `/delegate-team` alone | You know which model + backend you want. Skip orchestration. |
| `/mavis-team` alone | You want a specific team composition. Skip auto-picking. |
| LLM directly (no agents) | Trivial edits. Use `:edit` mode. |
| **`delegate-team` / `/mavis-ship`** | Anything else. Let the orchestrator decide. |

---

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [`INSTALL.md`](./INSTALL.md) | Full installation guide + verification matrix |
| [`CHANGELOG.md`](./CHANGELOG.md) | v1 → v2 → v2.1 release notes |
| [`DT.md`](./DT.md) | Original `dt` CLI specifics (gateway internals) |
| [`orchestrator/README.md`](./orchestrator/README.md) | `/mavis-ship` details |
| [`scaffolder/README.md`](./scaffolder/README.md) | `mavis-skill-scaffold` reference |
| [`mmas/README.md`](./mmas/README.md) | Multi-agent team framework |
| [`integrations/README.md`](./integrations/README.md) | Companion frameworks overview |
| [`AGENTS.md`](./AGENTS.md) | Repo conventions for contributors |
| [`CLAUDE.md`](./CLAUDE.md) | Claude-Code-specific guidance |
| [`DELEGATION_PROTOCOL.md`](./DELEGATION_PROTOCOL.md) | Lean Token Protocol spec |
| [`SECURITY.md`](./SECURITY.md) | Auth + scope policy |
| [`ROLE_ROUTING.md`](./ROLE_ROUTING.md) | Backend routing rules |

---

## 🤝 Contributing

1. **Fork** and **clone** the repo.
2. **Read** [`AGENTS.md`](./AGENTS.md) — repo conventions live here.
3. **Make a feature branch**: `git switch -c feat/your-change`
4. **Run CI locally**:
   ```bash
   bash -n install.sh
   bash -n orchestrator/scripts/orchestrate.sh
   python -m py_compile mmas/spawn-team.py mmas/hash-edit.py
   python -m json.tool < .claude-plugin/marketplace.json > /dev/null
   ```
5. **Open a PR** — the CI runs the same checks on the GitHub Actions runners.

### Adding a new component

See [`AGENTS.md`](./AGENTS.md#creating-a-new-component) for the full checklist.

### Adding a new sub-skill

Use the scaffolder to bootstrap it:

```bash
mavis-skill-scaffold --name my-new-skill --description "..." --type workflow
```

---

## 🛣️ Roadmap

- [x] **v2.0.0** — supersystem release (`/mavis-ship` + scaffolder + MMAS + integrations)
- [x] **v2.1.0** — Skills.sh + Claude Code marketplace compatibility
- [x] **v2.1.1** — orchestrate.sh regex routing fixes (BUILD/PUBLISM rule)
- [ ] **v2.2.0** — ATLAS web UI for non-CLI users
- [ ] **v3.0.0** — multi-tenant team runs + per-project skill isolation
- [ ] **v3.x.x** — Webhook-driven CI feedback loop (autoresearch auto-iterate on test fail)

---

## 💖 Acknowledgments

Built on top of amazing open-source work:

- [obra/superpowers](https://github.com/obra/superpowers) — the methodology layer
- [tw93/Waza](https://github.com/tw93/Waza) — the 8-skills framework
- [uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch) — the metric loop
- [imMamdouhaboammar/unslop-preflight](https://github.com/imMamdouhaboammar/unslop-preflight) — the UI quality gate
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — the registry infrastructure
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable), [addyosmani/best-practices](https://github.com/addyosmani) — design discipline
- And 1800+ curated skills at `~/.agents/skills/` powering the global arsenal.

---

## 📜 License

MIT — see [`LICENSE`](./LICENSE).

---

<div align="center">

<sub>If this repo saved you time, [star it ⭐](https://github.com/imMamdouhaboammar/delegate-team) or
[open an issue](https://github.com/imMamdouhaboammar/delegate-team/issues/new).</sub>

<sub>Built by <strong>Mamdouh Aboammar</strong> · Cairo, Egypt 🇪🇬</sub>

</div>
