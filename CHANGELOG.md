# CHANGELOG

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.7.2] - 2026-07-04

### Added

- `dt doctor --json` and `dt check --json` for machine-readable backend health checks.
- `dt setup` automation flags: `--project`, `--location`, `--skip-auth`, `--skip-gcp-enable`, `--skip-provision`, and `--yes`.
- `dt run --dry-run` to show selected backend, routing reason, fallback chain, and planned execution without running a backend.
- npm publish workflow that publishes only when `package.json.version` is not already on npm, validates the packed artifact, verifies registry state, and creates matching release metadata.

### Fixed

- npm package now includes `delegate-team/scripts/relay.mjs` and `delegate-team/scripts/opencode-router.mjs`, which are required at runtime by `dt run`.
- CI now installs the packed tarball in a temporary project and verifies runtime files before publish.
- Runtime root resolution now works across source checkout, npm install, and explicit `DT_RUNTIME_ROOT` override.
- Local setup config files are written with private permissions: config files `0600`, containing directories `0700`.
- Proxy body limit now supports `DT_PROXY_MAX_BODY`, with a safe 2MB fallback.
- Proxy token validation now uses constant-time comparison for equal-length tokens.
- Release workflow now validates `vX.Y.Z` tags explicitly and uses version-aware previous-tag ordering.
- `dt route --last` now selects the newest trace by file modification time instead of filename sorting.

### Docs

- Updated `docs/INSTALLATION.md` with automation-safe setup examples, `doctor --json`, `run --dry-run`, private config permissions, and updated network/write surface notes.

## [2.7.1] — 2026-07-02

### Added — Quality + CI fixes

This release bundles 6 quality fixes on top of v2.7.0, focused on getting
the CI green in any environment (fresh runner OR developer machine):

- **MEMORY path routing** — agent-kernel recall via "remember this:" /
  "what did we do" / "last time" triggers. Routes to agent-kernel
  (persistent memory layer) instead of running code. Highest priority —
  overrides RESEARCH. (orchestrator returns "MEMORY path — invoke
  agent-kernel (persistent memory; no code execution).")
- **JSON trace mode** (`--json`) — clean machine-readable output for
  v26-smoke.test.ts. Top-level keys: task, timestamp, detected_signals,
  selected_workflow (clean name), selected_workflow_description (full text),
  selected_stages, skipped_stages, reasons, dispatch, kernel_used.
- **`--check-kernel` flag** — reports kernel_used (0|1) in the trace.
- **Version sync** — package.json + .claude-plugin/plugin.json +
  .claude-plugin/marketplace.json + README.md all at 2.7.0.
- **Smoke tests env-independent** — tests/test-v2.7.0.sh works on fresh
  CI runners without ~/.mavis/skills or ~/delegate-team/bin/.
- **`autopilot.sh --help`** now handled BEFORE orchestrator dependency
  check, so it works even when ~/.mavis/skills/mavis-ship/scripts/ is
  missing (fresh install state).
- **`agents-health.sh`** gracefully reports "Summary: 0/0 agents ready"
  with installation hint when ~/delegate-team/bin/ doesn't exist yet.
- **NPM tarball cleaned** — only 1 .json file (package.json), 237.9 kB
  total (was 42.6 MB). Excludes examples/, develpment/, logs/, __pycache__/.

### Stats

- orchestrate.py --selftest: 49/49 ✓ (was 47/47)
- tests/test-v2.7.0.sh: 10/10 ✓ (works in local AND CI environments)
- v26-smoke routing tests: 8/8 ✓
- bundlephobia-guard: 1 JSON file in tarball ✓
- npm package size: 268.4 kB → 237.9 kB


## [2.7.0] — 2026-07-02

### Added — The Arsenal release

This release packages the full Mavis arsenal into `delegate-team` so it ships as
a single npm package + skills.sh-installable skill bundle. Everything that was
developed in `~/.mavis/skills/mavis-ship/` is now synced to the repo.

#### What's new

- **`mavis-ship/` standalone skill bundle** — separate directory with its own
  `SKILL.md` + `scripts/` (orchestrate.py + catalog.py + orchestrate.sh).
  Installable independently via `./install.sh --mavis-ship` or
  `npx skills add imMamdouhaboammar/delegate-team/mavis-ship`.

- **`bin/autopilot.sh`** — the GOD command. 7-stage chain that runs end-to-end:
  PREWARM (orchestrate.py + catalog.py) → BRAINSTORM (superpowers + codex
  gpt-5.5-high) → PLAN (superpowers:writing-plans) → EXECUTE (delegate-team →
  backend) → REVIEW (waza:check) → QUALITY-GUARD (5-layer check) → REPORT
  (markdown with all evidence). Supports `--background`, `--status`,
  `--follow`, `--dry-run`, `--list`, `--backend=<X>`.

- **`bin/mavis-ship-uni`** — the smart universal wrapper. Detects the calling
  runtime via env vars (MAVIS_SESSION_ID / CODEX_HOME / CLAUDECODE / GEMINI_CLI /
  OPENCODE_CONFIG_DIR / MMX_HOME) + parent process argv0 fallback, then dispatches:
  Mavis session → `orchestrate --prewarm` (Mavis decides + loads skills);
  codex / claude / gemini / opencode / mmx → `autopilot --background` (so the
  agent returns immediately); plain shell → autopilot foreground (you watch
  the log).

- **`bin/agents-health.sh`** — health check for the 10 coding agent symlinks
  in `~/delegate-team/bin/`. Reports PASS/FAIL with version detection.
  Renamed `mavis` → `mavis-original` to avoid conflict with the npm package
  `@minimax/mavis` (installed by the MiniMax Code desktop app).

- **`orchestrator/scripts/orchestrate.py`** — 47-case routing selftest (was
  regex-only bash). Each routing case verified. Outputs JSON manifest.

- **`orchestrator/scripts/catalog.py`** — 38 curated integrations + 1890
  unique skills auto-discovered across 3 sources (`~/.mavis/skills/`,
  `~/.agents/skills/`, `~/.claude/skills/`) with priority dedupe (mavis >
  agents > claude) + Jaccard similar-clusters detection + md5 content-duplicates
  detection.

- **`orchestrator/scripts/orchestrate.sh`** — replaced 22730-byte bash router
  with 1676-byte wrapper that delegates to `orchestrate.py` + `catalog.py`.

#### Files changed

- `package.json` — bumped 2.6.0 → 2.7.0, added 3 bin entries
  (`mavis-ship-uni`, `autopilot`, `agents-health`), added Python engine
  requirement, expanded `files` list to ship the full arsenal.
- `SKILL.md` — root manifest updated to reference the v2.7.0 arsenal.
- `INSTALL.md` — quickstart updated with mavis-ship-uni + autopilot usage.
- `mavis-ship/SKILL.md` — NEW standalone skill bundle (159 lines).
- `bin/autopilot.sh` — NEW (316 lines).
- `bin/mavis-ship-uni` — NEW (223 lines).
- `bin/agents-health.sh` — updated to use `mavis-original` (137 lines).
- `orchestrator/scripts/orchestrate.py` — synced from mavis-ship (1256 lines).
- `orchestrator/scripts/catalog.py` — synced from mavis-ship (1281 lines).
- `orchestrator/scripts/orchestrate.sh` — replaced with new wrapper (46 lines).

#### Backwards compatibility

- The 4 existing bin entries (`dt`, `delegate-team`, `mavis-ship-uni`,
  `autopilot`, `agents-health`) are added without removing the existing ones.
- Old `mavis` symlink renamed to `mavis-original` to avoid conflict with the
  `@minimax/mavis` npm package. Update any scripts that hardcoded the old path.
- All v2.6.0 install modes still work (`--dry-run`, `--no-network`,
  `--trust-mode`, `--yes`).

## [2.6.0] — 2026-06-30

### Added — Clarity + safety release

This release focuses on making `delegate-team` easier to **install, audit, and
trust** as a local agent OS. No backend behavior change; the `dt` CLI + the
`/mavis-ship` orchestrator remain backwards compatible.

#### What changed at a glance

- **`docs/` split** — README is now scannable in under 5 minutes. Deep
  material lives in 7 new docs files.
- **Installer safety modes** — `install.sh` now supports `--dry-run`,
  `--no-network`, `--trust-mode <strict|normal|dev>`, `--yes`.
- **Routing traces** — every orchestrator run writes a structured JSON
  trace under `dt_traces/routing/`. `dt route --explain "<task>"` prints
  it inline.
- **MMAS guardrails** — max-agents cap (hard 8, default 4), per-agent
  timeout (default 900 s, hard cap 7200 s), plan-only mode, write-mode
  boundary, kill switch with SIGTERM-then-SIGKILL grace.
- **agent-kernel boundary** — `dt kernel` shows binary path, version,
  memory home, and episode/rule counts. `dt kernel --require` exits 2
  if the kernel is not ready (binary missing OR memory home absent).
- **Portability fix** — `mmas/spawn-team.py` no longer hardcodes
  `${DELEGATE_TEAM_ROOT}`. Resolves via `$DELEGATE_TEAM_ROOT`
  env var → parent-of-mmas-with-package.json heuristic → historical
  fallback with warning.
- **Tests** — `tests/v26-smoke.test.ts` adds 14 smoke checks across
  version consistency, routing traces, installer safety, kernel detection,
  MMAS guardrails. All 53/53 tests pass.
- **Pre-v2.6.0 audit** — `docs/audits/REPO-AUDIT-vNEXT.md` enumerates
  every drift and credibility issue addressed by this release.

#### New docs (under `docs/`)

- `INSTALLATION.md` — full install reference for the 3 lanes
- `ARCHITECTURE.md` — 5-layer mental model, data flow, boundaries
- `ROUTING.md` — verdict priority, signals, JSON trace shape
- `WORKFLOWS.md` — real examples per verdict + common tripping phrases
- `AGENT-KERNEL-INTEGRATION.md` — companion boundary contract
- `MMAS.md` — multi-agent runtime + safety guardrails
- `SECURITY-MODEL.md` — threat model + opt-in switches + installer flags
- `audits/REPO-AUDIT-vNEXT.md` — pre-v2.6.0 audit baseline

#### New CLI commands

```
dt route [task...]                            # routing decision (human)
dt route --explain [task...]                  # structured JSON trace
dt route --explain --check-kernel [task...]   # trace + kernel warning
dt route --last                               # print most recent trace
dt route --no-trace-file [task...]            # trace but don't persist
dt kernel                                     # status panel
dt kernel --require                           # exit 2 if not ready
dt kernel-version                             # vendored binary version
```

#### New orchestrator flags (`orchestrate.sh`)

```
--json            emit structured JSON trace on stdout
--check-kernel    append soft warning if agent-kernel is missing
--no-trace-file   skip the dt_traces/routing/ write
--trace-dir DIR   override the default trace directory
```

#### New installer flags (`install.sh`)

```
--dry-run                   show every write + network call without executing
--no-network                skip npx skills add, git clone, npm install -g
--trust-mode strict|normal|dev
                            strict: refuse MCP auto-load + user hooks; print every sensitive op
                            normal: current safe default
                            dev:    permissive; warnings still print
--yes (-y)                  non-interactive approval (for CI / strict mode)
```

#### New MMAS guardrail flags (`spawn-team.py spawn`)

```
--max-agents N              default 4, hard cap 8
--timeout SECONDS           default 900, hard cap 7200
--plan-only                 print planned team + guardrails, do not spawn
--no-write                  alias for --write-mode none
--write-mode <mode>         workspace | logs-only | none
--kill-grace SECONDS        default 5s between SIGTERM and SIGKILL
```

#### New MMAS subcommand

```
spawn-team.py report <task_id>     # post-hoc summary + report.json
```

#### Routing trace schema (stable from v2.6.0)

```json
{
  "task": "<original task>",
  "detected_signals": {
    "publish_release_build": 0,
    "ui_frontend": 4,
    "bug_fix": 0,
    "metrics_research": 0,
    "memory_recall": 0,
    "multi_agent": 0,
    "think_design": 2,
    "research": 0,
    "delegate": 0
  },
  "selected_workflow": "UI DELIVERY",
  "selected_stages": ["/think (Waza)", "unslop audit (UI gate)", ...],
  "reasons": ["think=2 ...", "ui_frontend=4 ..."],
  "skipped_stages": [...],
  "kernel_used": 1,
  "kernel_warning": "",
  "timestamp": "2026-06-30T12:00:00Z"
}
```

The 6 spec-required signal buckets are emitted first and in order; the 3
extras (`think_design`, `research`, `delegate`) are present for richer
debugging.

#### README restructure

README is now 269 lines (was 404) and follows a 3-lane picker:

- **Lane 1** — `dt` CLI only (npm)
- **Lane 2** — `/mavis-ship` in Claude Code (+ orchestrator)
- **Lane 3** — full local agent OS (+ MMAS + agent-kernel + companions)

Removed hype ("four routing layers", "1800+ skills") that couldn't be
verified. Added explicit **maturity** column per component.

#### Version hygiene fixes

- README install example: `→ 2.4.0` → `→ 2.6.0` (was 3 minor versions stale)
- README roadmap: marked v2.5.0 / v2.5.1 as shipped, v2.6.0 as the
  current release.
- CHANGELOG doc-link in README now reflects v2.5 release notes.

#### Bug fixes

- **`set -u` + empty array crash** in `orchestrate.sh` produced invalid
  JSON (`"reasons": ,`) for RESEARCH-only tasks. Fixed by ensuring
  reasons_list and selected_list always have a placeholder.
- **`json_str` not defined early enough** in `orchestrate.sh` — the TRIVIAL
  early-exit branch crashed with `command not found`. Moved the helpers
  before all early exits.
- **Signal priority drift** — `multi_agent` now wins only after
  BUILD/PUBLISH, MEMORY, UI DELIVERY, BUG, PERFORMANCE/METRIC, and RESEARCH.
  This prevents broad "complex" phrasing from stealing specialized paths.
- **Kernel false positive** — `kernel_used` is now 0 unless the installed
  kernel binary AND memory home are both detected.
- **Agent-kernel vendoring** — `agent-kernel/dist/cli.mjs` now lives in the
  repo and reports the vendored version, so Skills.sh installs can validate
  the tool without npm install.
- **MMAS no-write ambiguity** — `--no-write` now maps to `--write-mode none`.
- **Installer dry-run leak** — dry-run no longer creates target directories.

## [2.5.1] - 2026-06-29

### Fixed

- **BundlePhobia Rspack packaging regression**: `dist/cli.js` no longer uses
  `new URL('../package.json', import.meta.url)`.
