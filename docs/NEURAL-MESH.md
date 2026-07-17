# Neural Mesh

> **One sentence**: delegate-team is wired as one connected organism — every
> component is a **neuron**, every intelligent link between them is a
> **synapse**, and every action fires a **synapse event** onto a single unified
> **trace bus**. `neural-mesh.json` is the connective tissue.

This document is the conceptual map of that wiring. For "how do I inspect it",
see `dt mesh` below.

---

## Why it exists

Before v2.9.0, the pieces lived on separate islands:

- `dt` CLI (TypeScript) — `role-router.ts`, `run.ts` (fallback ring),
  `delegate.ts`, `route.ts` — each with **hardcoded** tables
  (`ROLE_CAPABILITIES`, `FALLBACK_RING`).
- `orchestrate.py` (Python) — its own routing + verdict logic.
- `catalog.py` (Python) — its own integration arsenal + skill discovery.
- `delegate-skills/` — five skills, each its own loop.
- Five backends, MMAS, agent-kernel — isolated.

No shared spine. Editing routing meant editing three files in two languages.
The neural mesh collapses that: **one file** (`neural-mesh.json`) describes every
neuron and every synapse, and **both** the TypeScript CLI and the Python
orchestrator read it. Edit the mesh → rewire the whole system.

## The three primitives

### 1. Neuron

A component. Each has an `id`, a `label`, a `kind`, a `layer` (0 = bus, 1 =
gateway/router, 2 = orchestrator/registry/gate, 3 = memory, 4 = runtime, 5 =
backend), a `runtime`, and an `entry` file.

```json
{ "id": "delegate-grok", "label": "Grok Delegate", "kind": "delegate-skill",
  "layer": 1, "summary": "...", "runtime": "typescript",
  "entry": "delegate-skills/grok-delegate/scripts/relay.mjs" }
```

### 2. Synapse

A typed, weighted, intelligent connection between two neurons. The eight edge
types are the vocabulary of the system:

| Type | Meaning |
|---|---|
| `ROUTES_TO` | orchestrator / role-router deciding where a task goes |
| `FALLBACKS_TO` | automatic failover ring edge |
| `DISCOVERS` | catalog → skill / integration match |
| `MEMORY_OF` | a component that reads / writes agent-kernel |
| `COMPOSES` | a runtime that spawns another (MMAS → backend) |
| `GATE_BEFORE` | a quality gate applied before an action |
| `METHOD_BEFORE` | a methodology stage applied before an action |
| `EMITS_TO` | a neuron that writes to the trace bus |

```json
{ "type": "ROUTES_TO", "from": "orchestrator", "to": "delegate-grok",
  "weight": 0.9, "signal": "verdict==DELEGATE && agent==grok" }
```

The `signal` is a human-readable trigger condition — the contract that says
*when* this synapse fires.

### 3. Trace bus

A single coherent event log (`~/.config/dt/neural/`). Every time a neuron fires
a synapse, it emits a `SynapseEvent`:

```json
{ "event_id": "syn-…", "ts": "ISO", "trace_id": "neural-…",
  "from": "dt-cli", "to": "minimax", "type": "ROUTES_TO",
  "signal": "router score 0", "weight": 1.0 }
```

This is what turns the system from a set of islands into **one connected piece**:
the entire neural path of any task can be replayed as a single trace.

## Inspecting the mesh

```bash
dt mesh                 # neurons + synapses summary
dt mesh --json          # full mesh as JSON
dt mesh --graph         # DOT graph (pipe to: dot -Tsvg > mesh.svg)
dt mesh --neurons       # neurons only
dt mesh --synapses      # synapses only
dt mesh --trace         # replay recent synapse events from the bus
dt mesh --last          # the most recent synapse event
```

Python side (same file):

```bash
orchestrate.sh mesh                 # summary
orchestrate.sh mesh neurons         # neuron table
orchestrate.sh mesh synapses        # synapse table
orchestrate.sh mesh graph           # DOT graph
```

## How routing now works

```
task
  │
  ├─ dt run ──────────────► resolveFallbackChain(backend)  ← mesh FALLBACKS_TO
  │                           emitSynapse(ROUTES_TO)        ← trace bus
  │                           on failure: emitSynapse(FALLBACKS_TO)
  │
  ├─ role-router ─────────► backendsForRole(role)          ← mesh ROUTES_TO
  │
  └─ orchestrate.py ──────► DELEGATE verdict
                              └─ _delegate_dispatch(agent)
                                   └─ mesh.delegateTargetFor(agent)  → dt delegate <agent>
```

The orchestrator no longer hardcodes the delegate command. The `DELEGATE path`
verdict now emits a real `dt delegate <agent> --brief …` command, resolved from
the mesh's `ROUTES_TO` synapses.

## Extending the mesh

To add a new connection (e.g. wire a new backend into the failover ring):

1. Add the backend neuron to `neural-mesh.json` → `neurons`.
2. Add `FALLBACKS_TO` synapses from every existing backend to it (and from it to
   the others), weighted by preference.
3. No code change needed — `dt run`, `role-router`, and `orchestrate.py` pick it
   up automatically.
4. `dt mesh --graph | dot -Tsvg` to visualize; `dt mesh --trace` to confirm the
   synapse fires.

## Where the code lives

| Layer | File |
|---|---|
| TypeScript engine | `src/neural/mesh.ts` |
| Synapse vocabulary | `src/neural/synapse.ts` |
| Trace bus | `src/neural/trace-bus.ts` |
| `dt mesh` command | `src/commands/mesh.ts` |
| Python engine | `orchestrator/scripts/neural_mesh.py` |
| Single source of truth | `neural-mesh.json` (repo root) |

## Trust boundaries (unchanged)

The mesh is **advisory wiring**, not an executor. It decides *where* a task
should go and *records* that decision; it never runs code. The existing trust
boundaries in [SECURITY-MODEL.md](./SECURITY-MODEL.md) still apply — `dt` stays
sandboxed, delegates never commit, and the supervisor lands the diff.
