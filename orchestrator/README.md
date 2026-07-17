# orchestrator/ — `/Apeiron` skill

> The single switch that orchestrates the entire delegate-team engineering arsenal.

## What this is

One canonical file (`SKILL.md`) + one CLI router (`scripts/orchestrate.sh`).

It's the **front door** of the supersystem. Users type `/Apeiron "<task>"` (or call
`apeiron "<task>"`) and get the full chain:

```
/Apeiron "<task>"
    │
    ▼ 1. WAZA /think         ← design + pressure-test
    ▼ 2. unslop audit        ← BLOCKING if UI (score ≥70)
    ▼ 3. superpowers writing-plans
    ▼ 4. routed by signature:
       ├─ metric-driven  → autoresearch loop
       ├─ heavy multi    → /delegate-team
       ├─ parallel       → /apeiron-team (MMAS)
       └─ trivial         → execute locally
    ▼ 5. WAZA /check         ← review with evidence
    ▼ 6. quality-guard       ← 5-layer pre-delivery
    ▼
   SHIP
```

## Install

Handled by parent `./install.sh`:

```bash
./install.sh --apeiron
# or
./install.sh --all
```

The installer:
- copies `SKILL.md` + `scripts/orchestrate.sh` to `~/.apeiron/skills/apeiron/`
- creates symlinks in `~/.claude/skills/` (skill loader) + `~/.claude/commands/`
  (slash command) + `~/.local/bin/apeiron` (CLI on PATH)

## Usage

```bash
# Slash command (Claude Code-native)
/Apeiron "Make API p95 < 200ms"

# CLI (returns routing decision without execution)
apeiron "Build a landing page with shadcn"

# Skill loader (programmatic)
# Claude Code auto-loads SKILL.md when the orchestrator triggers
```

## Routing decisions (regex)

| Stage | Trigger keywords |
|---|---|
| `/think` | plan, design, build, create, implement, add, architect |
| `unslop audit` | ui, frontend, page, component, layout, css, shadcn, modal |
| `systematic-debugging` | fix, bug, broken, regression, failing, crash, error, leak |
| `autoresearch` | \d+%, p\d+, <\s*\d, reduce.*by, increase.*by, coverage, latency |
| `/delegate-team` | refactor, migrate, overhaul, rewrite, across, architecture |
| `/apeiron-team` MMAS | team, squad, parallel, specialize, swarm |
| `/read + /learn` | research, learn, understand, investigate, study, explore |
| TRIVIAL skip | rename, comment, remove, bump, update the version |

See `SKILL.md` for the full composition table and decision logic.

## Files

- `SKILL.md` — Canonical skill manifest (single source of truth, 6.6 KB)
- `scripts/orchestrate.sh` — Regex-based task-signature router (4.5 KB)

Both are also symlinked from `~/.claude/skills/apeiron/` and
`~/.apeiron/skills/apeiron/` after install.
