# Architecture

> **One sentence**: delegate-team routes coding tasks through the right agentic
> workflow, governed by local memory, rules, and policy checks.

This doc is the conceptual map. For "how do I install it", see
[INSTALLATION.md](./INSTALLATION.md). For "what does each component do", see
the per-component docs linked below.

---

## The five layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  0. Neural Mesh (neural-mesh.json + src/neural/) — the connective      │
│     tissue: every component is a neuron, every link a synapse, all     │
│     events flow through one trace bus. `dt mesh` inspects it.          │
├──────────────────────────────────────────────────────────────────────┤
│  1. dt CLI                       — npm gateway, low-level dispatch   │
│  2. /apeiron orchestrator     — single-command natural-language     │
│                                    routing of any task                  │
│  3. agent-kernel                 — memory + governance (companion)     │
│  4. MMAS                         — multi-agent team runtime            │
│  5. Backend agents               — Codex / MiniMax / Gemini / MetaGPT │
└──────────────────────────────────────────────────────────────────────┘
```

### Layer 1 — dt CLI

- npm package: `delegate-team`.
- Surfaces: `dt run`, `dt run --dry-run`, `dt doctor --json`, `dt metagpt`,
  `dt serve`, `dt route`, `dt mesh`, `dt delegate`.
- Standalone: does not require `/apeiron`, agent-kernel, or MMAS.
- Use when: you want to inspect or dispatch a task to a backend, run the LLM
  gateway proxy on `127.0.0.1:3000`, or **inspect the whole system as one
  connected piece** via `dt mesh`.

### Layer 0 — Neural Mesh (the connective tissue)

- Single source of truth: `neural-mesh.json` at the repo root. Both the
  TypeScript `dt` CLI (`src/neural/`) and the Python orchestrator
  (`orchestrator/scripts/neural_mesh.py`) read it.
- Every component is a **neuron**; every intelligent link is a **synapse**
  (typed + weighted). Routing tables (`ROLE_CAPABILITIES`, `FALLBACK_RING`) and
  the `dt delegate` verdict are now *derived from the mesh* rather than
  hardcoded, so editing one file rewires both runtimes.
- Every action fires a **synapse event** onto a unified trace bus
  (`~/.config/dt/neural/`). Replay any task's full neural path with
  `dt mesh --trace`.
- See [NEURAL-MESH.md](./NEURAL-MESH.md) for the full model.

### Layer 2 — /apeiron orchestrator

- Bash + Skills.sh skill at `orchestrator/`.
- Symlinks installed to `~/.apeiron/skills/apeiron/` and `~/.claude/commands/apeiron.md`.
- Inspects the natural-language task, scores stage signals, picks a verdict,
  and writes a structured route trace.
- `dt route --last` selects the newest trace by file modification time.
- Use when: you have a natural-language task and want the right stage chain.
- See [ROUTING.md](./ROUTING.md).

### Layer 3 — agent-kernel (companion)

- Vendored at `agent-kernel/dist/cli.mjs`.
- Single source of truth for: shared rules, episodic memory, approval inbox,
  generated `AGENTS.md` / `CLAUDE.md` / cursor rules.
- **Opt-in**: the orchestrator skips the memory stage entirely when
  `~/.agent-kernel/` is absent.
- See [AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md).

### Layer 4 — MMAS

- Python team runtime at `mmas/spawn-team.py` + `mmas/watchdog.sh`.
- Spawns 1–8 specialist agents (Atlas / Forge / Scout / Oracle / Librarian /
  Reviewer / Visionary / Sentinel) in parallel, watches them with a watchdog.
- Agents and watchdogs are started with `start_new_session=True`, which gives
  each worker a detached process group. The stop command terminates those
  groups, not just parent PIDs.
- Guardrails: max agents cap, per-agent timeout, plan-only mode, process-group
  cleanup, kill switch.
- See [MMAS.md](./MMAS.md).

### Layer 5 — Backend agents

- `aonios-agent/` — Codex + opencode dispatcher
- `minimax-coder/` — MiniMax via `mmx` CLI
- `vertex-coder/` — Gemini via google-genai
- `metagpt/` — multi-role team runner (experimental)

---

## Data flow (a single `/apeiron "X"` invocation)

```
1. User types:    /apeiron "X"
2. Slash command loads orchestrator/SKILL.md
3. Orchestrator runs: apeiron "X"
4. apeiron:
     a. Lowercases + scores stage signals
     b. Picks verdict (RESEARCH / MEMORY / BUILD / PERF / UI / MMAS / BUG / FEATURE / default)
     c. Writes trace JSON
     d. Prints human-readable summary
5. Orchestrator SKILL.md drives execution of the chosen stages:
     - /think (Waza)
     - agent-kernel memory search (if MEMORY path)
     - unslop audit (if UI path)
     - writing-plans (superpowers)
     - autoresearch | /delegate-team | /apeiron-team (chosen execution path)
     - /check (Waza) + quality-guard (Apeiron)
     - agent-kernel episode add (always, on success)
6. Final result is captured as an episode in ~/.agent-kernel/episodes/
```

---

## Release flow

```
package.json version bump
        ↓
npm run version:check
        ↓
package-lock warning if stale
        ↓
CI: typecheck + build + test + npm pack validation
        ↓
npm publish --provenance if version is new
        ↓
registry verify + npx install verify
        ↓
matching Git tag and GitHub Release
```

The publish workflow does not blindly publish on every push. It checks whether
`package.json.version` already exists on npm and skips publish when the version
is already present.

---

## What lives in the repo vs. on the user's machine

| Lives in repo | Lives on user machine after install |
|---|---|
| `src/cli.ts` (TypeScript source) | `dist/cli.js` (compiled) |
| `orchestrator/SKILL.md`, `orchestrate.sh` | `~/.apeiron/skills/apeiron/`, `~/.claude/commands/apeiron.md` |
| `mmas/spawn-team.py`, `watchdog.sh`, `agents/*.yaml` | `~/.apeiron/agents/apeiron/multi-agent/` |
| `agent-kernel/dist/cli.mjs` | `~/.agent-kernel/` (memory home), `~/.local/bin/agent-kernel` |
| `install.sh` | run from clone |
| `integrations/*.md` (docs) | `~/.claude/skills/`, `~/.claude/commands/` for companion frameworks |

---

## Trust boundaries

1. **`dt` is sandboxed**: workspace-bound, command-allowlisted, MCP opt-in via
   `DT_ENABLE_MCP=true`. See [SECURITY-MODEL.md](./SECURITY-MODEL.md).
2. **`/apeiron` is advisory**: the orchestrator prints a routing decision
   and the SKILL.md drives execution through Claude Code's tool surface. The
   orchestrator never executes code directly; it tells the agent what to do.
3. **MMAS is process-spawning**: agents run as detached subprocess groups. Each
   agent is sandboxed by `cwd=<task_dir>`, bounded by guardrails, and cleaned up
   by process group.
4. **agent-kernel is file-system-rooted**: its memory home is a regular
   directory the user can `cat`, `grep`, and back up with normal Unix tools.
5. **npm publishing is CI-governed**: version drift, missing runtime files,
   secret-like package contents, and mismatched tags are blocked or warned
   before publish.

---

## Compatibility

- Node ≥ 20 for the `dt` CLI.
- Python ≥ 3.10 for MMAS and backend agents.
- Bash ≥ 4 for the orchestrator.
- Tested on macOS, Ubuntu, Windows WSL2.

---

## Where to go next

| You want | Read |
|---|---|
| Install + verify | [INSTALLATION.md](./INSTALLATION.md) |
| How routing works | [ROUTING.md](./ROUTING.md) |
| Neural mesh (connected system) | [NEURAL-MESH.md](./NEURAL-MESH.md) |
| Memory + governance | [AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md) |
| Multi-agent runtime | [MMAS.md](./MMAS.md) |
| Security model | [SECURITY-MODEL.md](./SECURITY-MODEL.md) |
| Slash commands + per-workflow examples | [WORKFLOWS.md](./WORKFLOWS.md) |
