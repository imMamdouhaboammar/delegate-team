# Integrations

The `delegate-team` orchestrator layers on top of **four companion frameworks** that each
handle one slice of the engineering discipline. Install them all in one command:

```bash
./install.sh --integrations
```

| Framework | Role | Install |
|---|---|---|
| **superpowers** | Methodology — brainstorm → plan → TDD → review → ship | One-shot script |
| **Waza** | Entry-point — 8 habits-engineering skills (think/ui/check/hunt/...) | `npx skills add` |
| **unslop-preflight** | UI quality gate — 23 reasoning gates block generic slop | `npm install -g` |
| **autoresearch** | Metric-driven iteration — improves metric X by Y% | `npx install` |

Each framework below has a one-page guide: what it does, why we use it, install command.

## How they compose

```
[mavis-ship "<task>"]
    │
    ▼  Waza /think                          ← vocabulary front door
    │
    ▼  unslop audit (BLOCKING for UI)       ← spec-time quality gate
    │
    ▼  superpowers writing-plans            ← methodology checkpoint
    │
    ▼  delegates to:                        ← execution engine
       /delegate-team  (single model)  OR
       /mavis-team      (MMAS parallel)
       /autoresearch    (metric loop)
    │
    ▼  Waza /check                          ← review with evidence
    │
    ▼  quality-guard                        ← Mavis 5-layer pre-delivery
    │
    ▼
   SHIP
```

See:
- [`superpowers.md`](./superpowers.md)
- [`waza.md`](./waza.md)
- [`unslop-preflight.md`](./unslop-preflight.md)
- [`autoresearch.md`](./autoresearch.md)
