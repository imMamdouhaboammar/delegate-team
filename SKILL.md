---
name: delegate-team
description: |
  Complete agentic engineering supersystem — one command orchestrates the entire
  engineering chain. Use when the user asks for "the full Mavis arsenal", "use
  everything you have", "/mavis-ship", "/delegate-team", "delegate to a backend",
  "spawn a multi-agent team", "make a CLI to scaffold skills", or any natural-language
  request that should drive a Claude Code or Codex session through the full
  brainstorm → plan → execute → verify → ship pipeline. Composes four companion
  frameworks (superpowers, Waza, unslop-preflight, autoresearch) plus the original
  `dt` gateway CLI, multi-agent team (MMAS) framework, skill scaffolder, the
  /mavis-ship orchestrator (47-case selftest routing), and the v2.7.0 arsenal:
  autopilot.sh (7-stage GOD command), mavis-ship-uni (smart universal wrapper that
  detects the calling runtime), and 1890 auto-discovered skills across 3 sources.
---

# delegate-team — the agentic engineering supersystem

> **Install once. Run `dt run "<task>"` or `/mavis-ship "<task>"` anywhere.**

This is the **main** skill for the `delegate-team` supersystem. It bundles and
orchestrates six top-level components so a single natural-language task can run
through the full engineering chain without the user picking tools manually.

## What this skill IS

A **bundle** that lets Claude Code / Codex / Cursor / any `npx skills add`-compatible
agent run the supersystem end-to-end:

```bash
# One command, full chain (from Mavis session)
/mavis-ship "Make API p95 < 200ms"

# Same chain from any agent (codex / claude / gemini / opencode / mmx)
# → mavis-ship-uni detects the runtime + dispatches autopilot --background
mavis-ship-uni "Build a landing page with shadcn components"

# Plain shell (foreground — you watch the log)
mavis-ship-uni "Refactor the user model for multi-tenancy"

# Or invoke dt CLI for raw delegation
dt run "<task>"
```

When a Claude Code agent loads this skill, it treats every incoming task as
potentially runnable through the supersystem and applies the orchestrator's
routing logic before deciding what to do.

## Components wired (v2.7.0 — eleven)

| Component | Path | Function | Status |
|---|---|---|---|
| `orchestrator/` | `./orchestrator/` | `/mavis-ship` skill + regex router (47-case selftest) | ✅ |
| `orchestrator/scripts/orchestrate.py` | `./orchestrator/scripts/` | Router with 47 routing cases | ✅ |
| `orchestrator/scripts/catalog.py` | `./orchestrator/scripts/` | 38 integrations + 1890 skills indexer | ✅ |
| `mavis-ship/` | `./mavis-ship/` | Standalone mavis-ship skill bundle (SKILL.md + scripts) | ✅ NEW v2.7.0 |
| `bin/autopilot.sh` | `./bin/` | GOD command: 7-stage chain (PREWARM → BRAINSTORM → PLAN → EXECUTE → REVIEW → QUALITY-GUARD → REPORT) | ✅ NEW v2.7.0 |
| `bin/mavis-ship-uni` | `./bin/` | Smart universal wrapper: detects Mavis / codex / claude / gemini / opencode / mmx / shell | ✅ NEW v2.7.0 |
| `bin/agents-health.sh` | `./bin/` | Health check for the 10 coding agents in ~/delegate-team/bin/ | ✅ |
| `scaffolder/` | `./scaffolder/` | `mavis-skill-scaffold` generator CLI | ✅ |
| `mmas/` | `./mmas/` | Multi-agent team framework (8 agents + watchdog) | ✅ |
| `agent-kernel/` | `./agent-kernel/` | Local-first memory + governance layer (vendored v0.0.7) | ✅ |
| `god-agent/` | `./god-agent/` | Codex + opencode delegation backend | ✅ |
| `minimax-coder/` | `./minimax-coder/` | MiniMax-M3 via `mmx` CLI backend | ✅ |
| `vertex-coder/` | `./vertex-coder/` | Gemini backend | ✅ |
| `dt` CLI | `./src/` + `./dist/` | Gateway CLI (built via `npm run build`) | ✅ |

## Companion frameworks (optional integrations, install via `integrations/` guides)

| Framework | What it adds |
|---|---|
| **agent-kernel** | Local-first memory + governance layer — shared rules, episodic recall, approval inbox, deterministic guard (now bundled in `agent-kernel/`) |
| **superpowers** | Methodology — brainstorm-first hard gate, TDD, review |
| **Waza** | Entry-point skills — /think /check /hunt /ui ... |
| **unslop-preflight** | UI quality gate — 23 gates block generic slop |
| **autoresearch** | Metric-driven iteration loop |

## When to invoke this skill

`delegate-team` triggers automatically on:

| User prompt signal | Action |
|---|---|
| "use full engineering arsenal" | full chain |
| "<task>" + heavy multi-file | routed by signature |
| "<task>" + measurable metric | autoresearch loop |
| "<UI task>" | unslop audit (BLOCKING if score <70) then chain |
| "<trivial edit>" | handle locally, skip chain |
| "build a CLI / make X faster / design Y" | routed by signature |

See [`orchestrator/SKILL.md`](./orchestrator/SKILL.md) for the full routing matrix
and decision logic.

## Hard-coded routing rules

```bash
# Quick reference
mavis-orchestrate "<task>"   # Prints the route, no execution
```

Detection signals (regex scoring 0-3):

| Stage | Trigger words |
|---|---|
| `/think` (Waza) | plan, design, build, create, implement, add, architect |
| `unslop audit` (BLOCKING) | ui, frontend, page, component, layout, css, shadcn, modal |
| `systematic-debugging` (superpowers) | fix, bug, broken, regression, failing, crash, error, leak |
| `autoresearch loop` | \d+%, p\d+, <\s*\d, reduce.*by, increase.*by, coverage, latency, bundle |
| `/delegate-team` | refactor, migrate, overhaul, rewrite, across, architecture, service |
| `/mavis-team` MMAS | team, squad, parallel, specialize, swarm |
| `/read + /learn` | research, learn, understand, investigate, study, explore |
| TRIVIAL skip | rename, comment, remove, bump |

## Install

```bash
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all            # Everything (incl. agent-kernel v0.0.7 + mavis-ship v2.7.0 arsenal)
./install.sh --orchestrator   # Just /mavis-ship
./install.sh --mavis-ship     # Just the mavis-ship standalone skill bundle (NEW v2.7.0)
./install.sh --mmas           # Just the multi-agent framework
./install.sh --kernel         # Just agent-kernel (memory + governance)
./install.sh --integrations   # Just companion frameworks
./install.sh --verify         # Check what's installed
```

`./install.sh --verify` returns green for all 13 components (v2.7.0).

Verify on Skills.sh:

```bash
npx skills add imMamdouhaboammar/delegate-team -a claude-code -g -y
npx skills list               # Should show: delegate-team
```

## Files in this manifest

- `SKILL.md` — **THIS FILE** — main skill manifest
- `orchestrator/SKILL.md` — /mavis-ship specific skill (v2.7.0)
- `orchestrator/scripts/orchestrate.py` — 47-case router (selftest)
- `orchestrator/scripts/catalog.py` — 38 integrations + 1890 skills indexer
- `mavis-ship/SKILL.md` — standalone mavis-ship skill bundle (NEW v2.7.0)
- `bin/autopilot.sh` — 7-stage GOD command (NEW v2.7.0)
- `bin/mavis-ship-uni` — smart universal wrapper (NEW v2.7.0)
- `bin/agents-health.sh` — health check for 10 coding agents
- `scaffolder/SKILL.md` — mavis-skill-scaffold specific skill
- `mmas/SKILL.md` — multi-agent team specific skill
- `agent-kernel/SKILL.md` — agent-kernel (memory + governance) specific skill
- `god-agent/SKILL.md` — Codex + opencode backend
- `minimax-coder/SKILL.md` — MiniMax backend
- `vertex-coder/SKILL.md` — Gemini backend

## Compatibility

| Agent | Status |
|---|---|
| Claude Code | ✅ Tested — full install path |
| Cursor | ✅ Via `npx skills add` to `.agents/skills/` |
| Codex | ✅ Via `npx skills add` to `.codex/skills/` |
| Copilot | ✅ Via `npx skills add` to `.copilot/skills/` |
| Windsurf | ✅ Via `npx skills add` |
| Gemini CLI | ✅ Via `npx skills add` |
| OpenCode | ✅ Via `npx skills add` |
| 60+ more agents | ✅ See vercel-labs/skills README |

## License

MIT

## Repository

https://github.com/imMamdouhaboammar/delegate-team
