# Delegate-Team Autonomous Baseline

Date: 2026-08-17
Starting default branch: `master`
Starting SHA: `c16e308896c1ddf5bec91ed19e2275b3a077f80c`

This baseline records the repository state observed during the first Daily Autonomous Multi-Agent Engineering Agency run. It is descriptive, not aspirational: repository code and tests take precedence when documentation differs.

## Task intake

- `src/cli.ts` is the TypeScript CLI entry point.
- `src/commands/run.ts` accepts either a raw prompt or brief file, creates a temporary brief for raw prompts, and dispatches to a selected backend.
- `src/commands/delegate.ts` exposes direct delegation to the configured delegate-skill relays and requires an explicit brief.
- `mmas/spawn-team.py` is the MMAS task intake and task-state entry point for multi-agent work.

## Routing

`src/commands/run.ts` invokes the OpenCode router when no backend is explicitly selected. The current score thresholds are:

- score `>= 8`: MMAS
- score `> 5`: VertexCoder
- score `> 0`: OpenCode
- otherwise: MiniMax

If router execution fails, dispatch falls back to VertexCoder. Non-MMAS backends also use the fallback chain/mesh. Routing is explainable at the CLI through score and selected backend, but routing policy remains threshold-based and is not yet expressed as a capability contract.

## Task decomposition

There are multiple orchestration paths:

- MMAS explicit teams: `mmas/spawn-team.py spawn --team ...`
- MMAS Atlas picker: Atlas writes `team_plan.json` containing `team`, `tasks`, and `rationale`
- MetaGPT orchestration through the CLI
- top-level orchestrator workflows under `orchestrator/`

Atlas is currently the clearest decomposition contract in executable code. Before this daily initiative, its JSON was parsed but its structure, selected agents, duplicate agents, and task ownership were not validated fail-closed.

## Agent adapters

Direct delegate adapters are represented by `delegate-skills/<agent>-delegate/scripts/relay.mjs` and selected through `src/commands/delegate.ts` for `agy`, `codex`, `grok`, `kimi`, and `opencode`.

MMAS supports additional backends through `build_agent_command()` in `mmas/spawn-team.py`, including MiniMax, Vertex, Aonios/OpenCode, delegate relays, generic relay fallback, and a deterministic `mock-backend` for tests.

Host-specific behavior is partially isolated behind relay scripts, but MMAS still contains backend-specific command construction and compatibility rules.

## Context handling

- `runDispatch()` converts raw prompts into temporary brief files.
- Delegate relays receive a brief path rather than the entire parent process conversation.
- MMAS builds a worker-specific prompt containing role metadata, the assigned task, policy text, and result-file locations.
- Atlas may assign per-agent task strings in `team_plan.json`.

Context is bounded more than a full-conversation pass-through, but there is not yet a repository-freshness token or relevant-file hash attached to child results. A result can therefore become stale relative to repository mutation without a first-class freshness check.

## Permission handling

MMAS exposes `workspace`, `logs-only`, and `none` write modes and applies backend compatibility checks before spawning workers. It records requested/resolved modes and approved writable roots in `boulder.json`.

`verify_path_in_task_dir()` protects task-directory writes against traversal and symlink escapes for restricted modes. `get_clean_env()` filters the inherited environment, but currently allows several provider credentials broadly rather than selecting credentials per backend.

The repository's delegation protocol states stronger conceptual boundaries such as workspace-only filesystem access, deny-by-default network behavior, approval-required dependency installation, forbidden worker commits, and secret restrictions. These are policy goals that should continue to be checked against executable enforcement rather than assumed from documentation.

## Execution and parallelism

MMAS starts each worker with `subprocess.Popen(..., start_new_session=True)` and records PID/PGID state. Workers are launched one after another, but their subprocesses can execute concurrently after spawn.

Budgets are explicit:

- default max agents: 4
- hard max agents: 8
- default timeout: 900 seconds
- hard timeout: 7200 seconds
- bounded kill grace period

There is no explicit DAG/file-overlap scheduler in this path; independence is therefore primarily a caller/planner responsibility.

## Result handling

MMAS persists task state in `boulder.json`, per-agent logs, summary files, events, and a generated `report.json`. Worker summaries are evidence inputs, not final authority.

The Atlas planner result is a parent-facing worker result and therefore requires strict validation before downstream workers are selected. The 2026-08-17 initiative adds that missing validation boundary and terminal failure evidence for malformed plans.

## Verification and final authority

Repository documentation assigns final review/commit/merge authority to the controller or human rather than delegated workers. Tests cover routing, write modes, process groups, security behavior, timeouts, CLI contracts, and packaging.

Meaningful daily changes use Maker / Checker / Verifier separation:

- Maker: test-first implementation on a dedicated branch
- Checker: independent diff/contract review against the acceptance criteria
- Verifier: GitHub Actions plus targeted regression evidence

## Failure recovery

Existing mechanisms include:

- fallback routing for non-MMAS backends
- explicit spawn failure state
- process-group termination using SIGTERM followed by SIGKILL
- Atlas planning timeout cleanup
- user stop with process-group cleanup
- hard limits for agent count, runtime, and kill grace
- write-policy rejection before worker spawn

Observed first-run gap: malformed Atlas output or an Atlas exit without a plan could return an error while leaving task state non-terminal or silently skipping unknown agents. This is the selected initiative for this run.

## CLI and persistence

The package exposes `dt` / `delegate-team` and supporting binaries. MMAS supports `spawn`, `status`, `list`, `stop`, and `report`. Persistent MMAS state is local JSON/log state under the configured task root; it is not a transactional database and does not currently carry repository-freshness metadata.

## CI and tests

The default CI checks Node 24 compatibility, version synchronization, TypeScript typecheck, build, Vitest plus legacy shell tests, shell syntax/shellcheck, Python syntax/Bandit, routing smoke tests, package integrity, manifests, and additional security workflows. The first RED commit of this run intentionally failed only the new Atlas validation tests while the existing test population remained green.

## Baseline conclusion

Delegate-team already has meaningful safety primitives: bounded worker counts, write modes, environment filtering, process-group cleanup, deterministic fake workers, and broad CI. The highest-value maturation work is to make parent/child contracts, freshness, failure state transitions, permission grants, and verification authority as explicit in executable code as they are in the product's stated model.
