# CHANGELOG

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.1.1] - 2026-07-20

### Fixed
- Hardened AI Guardian workflow report handling by passing generated JSON through environment variables instead of interpolating it into JavaScript source.
- Fixed remaining AI Guardian summary and artifact JSON interpolation, aligned AI workflows on Node 24, and corrected the undefined `fixableIssues` value in AI Auto-Fix.
- Fixed Microsoft Defender for DevOps SARIF uploads with explicit least-privilege permissions and fork-safe upload conditions.
- Removed shell-enabled command execution from MiniMax tools and restricted integration installs to reviewed catalog commands.
- Marked duplicate-content MD5 hashing as non-security use and disabled Flask debug mode in the example test server.
- Removed a machine-specific absolute path from bundled documentation.

### Changed
- Standardized the supported runtime contract on Node.js 24 across package metadata, CI, quality gates, release verification, and documentation.
- Added a Bandit high-severity CI gate and regression tests for workflow and Python security hardening.
- Removed the stalled Codacy workflow after repeated multi-hour hangs; CodeQL, Defender, DevSkim, Bandit, Gitleaks, and package-integrity checks remain active.
- Replaced the version-heavy package description with a stable product description.

## [3.1.0] - 2026-07-20

### Added
- Added `dt remote bootstrap`, `init`, `agents`, `status`, `prompt`, and `doctor` to turn a connected ChatGPT session into a governed local coding agent, delegator, or hybrid agent.
- Added a copy-ready README bootstrap prompt that tests Remote Desktop Commander terminal/file access, discloses the global delegate-team installation, verifies `dt`, and asks the user to choose an operating mode.
- Added canonical workspace metadata, deny-by-default policy files, private local session state, generated `CHATGPT_REMOTE_AGENT.md` instructions, local CLI discovery, and machine-readable readiness reports.
- Added regression tests for paths containing spaces and reserved characters, policy idempotency, fake-agent discovery, README/template synchronization, and packaged runtime files.

### Fixed
- Fixed relay and router resolution when delegate-team is installed under paths containing spaces, `#`, URL-encoded characters, or symlink aliases such as `/tmp` and `/private/tmp`.
- Fixed MMAS startup on Python 3.9 by postponing runtime evaluation of modern type annotations.
- Fixed proxy security-test port collisions by using an ephemeral port and an explicit server lifecycle.

### Changed
- Replaced GitHub Actions npm publishing and automatic release creation with a documented, locally verified maintainer release process using the authenticated npm account on the trusted workstation.

### Security
- Remote Agent permissions deny dependency installation, deletion, commits, push, merge, publishing, persistent system changes, and credential-file access until explicitly enabled.
- Existing workspace policy is preserved unless `--force` is requested; delegated output must be reviewed and independently tested.

## [3.0.11] - 2026-07-17

### Fixed
- **Security (P1-19)**: Enforced `--write-mode` and `--no-write` policies in MMAS `spawn-team.py`. Previously, write mode was recorded in `boulder.json` but not enforced when spawning agent subprocesses; agents with write-capable backends were started regardless of policy.
- Added `check_write_policy_compatibility` — fails closed (exit code 3) before any subprocess is spawned when a backend is incompatible with the requested write mode.
- Added `verify_path_in_task_dir` — rejects any generated path (logs, briefs, summaries, output dirs) that escapes the isolated task directory via path traversal (`..`) or symlink.
- Subprocess environment is now sanitized via `get_clean_env`; `DT_WORKSPACE_ROOT` is locked to the task directory in `logs-only` and `none` modes; `DT_ALLOW_UNSAFE_COMMANDS` and `DT_ALLOW_DEP_INSTALL` are disabled.
- `watchdog.sh`: in `none` mode, the watchdog no longer requires a `.summary` file to mark an agent as `done` — a clean process exit (code 0) is sufficient.

### Added
- `MMAS_TASKS_ROOT` environment variable override for `spawn-team.py` task directory root (enables isolated test execution).
- `mock-backend` supported in `spawn-team.py` as a verified, sandboxed execution path for unit and integration testing.
- Task ID and Boulder path are now printed immediately after task path creation, making them available even when a run fails at the compatibility-check stage.
- `tests/mmas-write-modes.test.ts` — 10 Vitest regression tests covering write mode resolution, compatibility rejection, path containment, symlink escape detection, boulder metadata, and Atlas parameter inheritance.

### Changed
- `mmas/README.md`: corrected CLI usage examples (`--agents` → `--team`, added positional `spawn` subcommand, fixed watchdog polling description, corrected file size, completed backend compatibility list).
- `mmas/SKILL.md`: same corrections; added `MMAS_TASKS_ROOT` override note; `none` mode description now documents watchdog behavior.

## [3.0.10] - 2026-07-17

### Changed
- Improved the `auto-install` execution robustness by automatically cleaning up target directories in `/tmp` before cloning.
- Fixed relative copying destination paths for `impeccable` (`plugin/skills/*`) and `ux-ui-agent-skills` (`.claude/skills/*`).
- Added automatic detection and cleanup of broken or conflicting symlinks in `~/.claude/skills` before executing installations.
- Configured dynamic fallback from `pip` to `pip3` for Python integrations.

## [3.0.9] - 2026-07-17

### Added
- Extended the integrations catalog with 13 new repositories (e.g. `codegraph`, `ux-ui-agent-skills`, `garden-skills`, `hallmark`, `react-error-boundary`, `mattpocock/skills`, `agency-agents`, `repowise`, `Understand-Anything`, `Front-End-Checklist`, `rtk`, `awesome-agent-skills`, `agentic-awesome-skills`), increasing the registry to 56 integrations.
- Built a smart auto-discovery heuristic engine (`dt integrations [path] --auto`) that scans workspace files for React, TS, frontend styles, Python, and repository scale to recommend and install the most useful integrations.
- Updated the `graphify` integration repo URL to its canonical `Graphify-Labs/graphify` workspace.

## [3.0.8] - 2026-07-17

### Added
- Added `dt integrations` (alias `intg`) command and `bin/integrations.sh` to automatically check, install, and update all companion frameworks (Waza, unslop-preflight, superpowers, autoresearch) in one command.
- Integrated automated checker/installer with `install.sh --integrations` to run the verified script.

## [3.0.7] - 2026-07-17

### Changed
- Globally renamed any occurrences of `mavis` (case-insensitive) to `apeiron` across codebase files, configuration files, shell scripts, markdown docs, and tests.
- Renamed the CLI script file `scaffolder/bin/mavis-skill-scaffold` to `scaffolder/bin/apeiron-skill-scaffold`.

## [3.0.6] - 2026-07-17

### Added
- Extended MMAS `spawn-team.py` to route all unrecognized backends through `relay.mjs` or respective delegate skills.

## [3.0.5] - 2026-07-17

### Fixed
- Fixed workflow parsing issue for npm pack JSON output across different npm versions.

## [3.0.4] - 2026-07-17

### Fixed
- Fixed `package.json` `files` array to explicitly include scripts while maintaining parent directories.
- Updated Node.js engine requirement to `>=24`.

## [3.0.3] - 2026-07-17

### Fixed
- Fixed `collectHealth` test timing out in CI by adding a 15-second timeout, allowing real backend checks to complete reliably without mocking.

## [3.0.2] - 2026-07-17

### Fixed
- Fixed version consistency mismatch in `README.md` to ensure successful CI smoke test runs.

## [3.0.1] - 2026-07-17

### Fixed
- Fixed documentation path and command references in `docs/SECURITY-MODEL.md`, `docs/ROUTING.md`, `docs/MMAS.md`, `mmas/SKILL.md`, and `README.md` to match `/Apeiron` and `dt mmas`.

## [3.0.0] - 2026-07-17

### Added
- **Apeiron Integration** — Renamed the `/apeiron-ship` universal orchestrator to `/Apeiron` globally.
- Integrated `/Apeiron` directly into the `dt` CLI parser under `dt apeiron` (with `dt ship` alias).
- Integrated MMAS (Apeiron Multi-Agent System) directly into the `dt` CLI under `dt mmas`.
- Reconfigured dispatcher (`dt run`) to route complexity scores >= 8 directly to `mmas` (instead of `metagpt`).
- Registered `apeiron-uni` wrapper globally on path.

## [2.9.0] - 2026-07-17

### Added

- **Neural Mesh** — the connective tissue that makes delegate-team one connected
  piece. Every component is a **neuron**, every intelligent link a **synapse**,
  and every action fires a **synapse event** onto a single unified **trace bus**.
- `neural-mesh.json` at the repo root: the single source of truth for routing,
  failover, and delegation — shared by both the TypeScript `dt` CLI
  (`src/neural/`) and the Python orchestrator (`orchestrator/scripts/neural_mesh.py`).
- `src/neural/mesh.ts` (engine), `src/neural/synapse.ts` (8-type vocabulary),
  `src/neural/trace-bus.ts` (unified event bus at `~/.config/dt/neural/`).
- `dt mesh` command: `--json`, `--graph` (DOT), `--neurons`, `--synapses`,
  `--trace` (replay live synapse events), `--last`.
- `orchestrate.sh mesh [neurons|synapses|graph]` forwards to `neural_mesh.py`.
- Routing tables (`ROLE_CAPABILITIES`, `FALLBACK_RING`) and the `dt delegate`
  verdict are now **derived from the mesh** instead of hardcoded. Editing
  `neural-mesh.json` rewires both runtimes at once.

### Changed

- `role-router.ts` now resolves preferred backends from mesh `ROUTES_TO` synapses.
- `dt run` resolves the failover chain from mesh `FALLBACKS_TO` synapses and emits
  `ROUTES_TO` + `FALLBACKS_TO` synapse events onto the trace bus.
- `orchestrate.py` `DELEGATE` verdict now emits a real `dt delegate <agent>`
  command, resolved from the mesh's `ROUTES_TO` synapses.
- `docs/ARCHITECTURE.md` gains a Layer 0 (Neural Mesh) and `docs/NEURAL-MESH.md`
  documents the full model.

### Tests

- `tests/neural-mesh.test.ts` (11 cases): mesh loader, role/failover/delegate
  resolution, catalog discovery, neighbor queries, synapse integrity.
- `tests/neural-trace.test.ts` (3 cases): trace-bus emit + replay.
- The mesh tests surfaced two real gaps (missing `backend-opencode` /
  `backend-gemini` neurons, incomplete failover rings) which are now fixed in
  `neural-mesh.json`.

## [2.8.0] - 2026-07-17

### Added

- **delegate-skills component** — integrated the five standalone delegate skills
  (agy, codex, grok, kimi, opencode) as a first-class, discoverable, installable
  part of the system. Each wraps a CLI implementer agent behind the same loop:
  write a brief, dispatch via its `relay.mjs`, review the diff, land it yourself.
- `dt delegate <agent> [--brief <file>] [--read-only|--full-access] [--model X] [--cd <dir>] [--max-turns N]`
  CLI entry point that resolves `delegate-skills/<agent>-delegate/scripts/relay.mjs`
  and invokes it. Pure `buildDelegateArgs()` is unit-tested in `tests/delegate-cli.test.ts`.
- `./install.sh --delegate-skills` installs the five skills into
  `~/.apeiron/skills/` + symlinks for `~/.claude/skills/` and `~/.codex/skills/`,
  with a `verify` line and idempotent uninstall.
- Router (`orchestrate.py`) now returns a `DELEGATE path — <agent>-delegate skill`
  verdict for explicit "delegate this to grok" / "have codex do X" / "run it
  through opencode" phrasing (4 new selftest cases; 49 → 53).
- Discovery: 5 delegate skills registered in `skills.sh.json` (new "Delegate
  skills" grouping, featured `grok-delegate`) and `catalog.py` (43 integrations).
- Tests: `tests/delegate-cli.test.ts` (10 cases), `tests/test-v2.7.0.sh` extended
  to 13 cases (catalog count 38 → 43, delegate-skill discovery, install dry-run).

### Changed

- `skills.sh.json` integrations count 38 → 43; `orchestrate.py` selftest 49 → 53.
- Updated `SKILL.md`, `README.md`, `AGENTS.md` component maps and trigger tables.

## [2.7.2] - 2026-07-04

### Added

- `dt doctor --json` and `dt check --json` for machine-readable backend health checks.
- `dt setup` automation flags: `--project`, `--location`, `--skip-auth`, `--skip-gcp-enable`, `--skip-provision`, and `--yes`.
- `dt run --dry-run` to show selected backend, routing reason, fallback chain, and planned execution without running a backend.
- `npm run version:check` to guard version sync across package, plugin manifests, marketplace plugin entries, and changelog.
- npm publish workflow that publishes only when `package.json.version` is not already on npm, validates the packed artifact, verifies registry state, and creates matching release metadata.
- npm publish workflow lockfile warning when `package-lock.json` version metadata is stale.

### Fixed

- npm package now includes `delegate-team/scripts/relay.mjs` and `delegate-team/scripts/opencode-router.mjs`, which are required at runtime by `dt run`.
- CI now installs the packed tarball in a temporary project and verifies runtime files before publish.
- Runtime root resolution now works across source checkout, npm install, and explicit `DT_RUNTIME_ROOT` override.
- Local setup config files are written with private permissions: config files `0600`, containing directories `0700`.
- Proxy body limit now supports `DT_PROXY_MAX_BODY`, with a safe 2MB fallback.
- Proxy token validation now uses constant-time comparison for equal-length tokens.
- Release workflow now validates `vX.Y.Z` tags explicitly and uses version-aware previous-tag ordering.
- `dt route --last` now selects the newest trace by file modification time instead of filename sorting.
- MMAS `stop` now terminates agent and watchdog process groups, not only parent PIDs.
- MMAS Atlas timeout now cleans up the Atlas process group when `team_plan.json` is not produced in time.
- Python engine requirement now matches the MMAS/backend runtime contract: `python >=3.10`.

### Tests

- Added tests for `doctor --json` structured output.
- Added tests for `dt run --dry-run` planning output.
- Added tests to keep marketplace plugin entry versions in sync with `package.json`.
- Added tests to guard the npm package runtime file whitelist and bin aliases.

### Docs

- Updated `README.md` for `2.7.2`, dry-run routing, JSON doctor output, release checks, npm hardening, and refreshed CI commands.
- Updated `docs/INSTALLATION.md` with runtime requirements, release/publish checks, lockfile drift guidance, and process-group cleanup notes.
- Updated `docs/ARCHITECTURE.md` with release flow, publish guard, runtime compatibility, and MMAS process-group boundary.
- Updated `docs/SECURITY-MODEL.md` with npm publish safety, proxy hardening, private config permissions, and MMAS cleanup semantics.
- Updated `docs/MMAS.md` with process-group cleanup, Atlas timeout cleanup, PID/PGID state, and current CLI behavior.

## [2.7.1] - 2026-07-02

### Added

- Memory path routing for strong recall prompts such as `remember this` and `what did we do last time`.
- JSON trace mode for routing smoke tests.
- `--check-kernel` flag in routing traces.
- Environment-independent smoke tests for fresh CI runners.

### Fixed

- `autopilot.sh --help` now works before orchestrator dependency checks.
- `agents-health.sh` handles empty install state gracefully.
- npm tarball cleanup reduced package size and kept only `package.json` as a JSON asset.

### Verified

- `orchestrate.py --selftest`: 49/49.
- `tests/test-v2.7.0.sh`: 10/10.
- Bundlephobia guard: one JSON file in tarball.

## [2.7.0] - 2026-07-02

### Added

- Full Apeiron arsenal packaged into `delegate-team`.
- Standalone `apeiron/` skill bundle.
- `bin/autopilot.sh` 7-stage command wrapper.
- `bin/apeiron-uni` universal runtime wrapper.
- `bin/agents-health.sh` health check helper.
- Python orchestrator and catalog scripts synced into the repo.

### Changed

- `package.json` expanded to ship the full arsenal.
- Root skill manifests updated for the 2.7.0 package layout.

### Compatibility

- Existing `dt`, `delegate-team`, `apeiron-uni`, `autopilot`, and `agents-health` bin entries remain available.
- Existing v2.6.0 installer modes remain supported.

## [2.6.0] - 2026-06-30

### Added

- Split documentation under `docs/` for installation, architecture, routing, workflows, kernel integration, MMAS, and security model.
- Installer safety modes: `--dry-run`, `--no-network`, `--trust-mode`, and `--yes`.
- Structured routing traces under `dt_traces/routing/`.
- `dt route`, `dt route --explain`, `dt route --last`, and trace-related flags.
- `dt kernel`, `dt kernel --require`, and `dt kernel-version`.
- MMAS guardrails: max agents cap, timeout cap, plan-only mode, write-mode, kill grace, and reporting.

### Fixed

- `set -u` and empty array crash in `orchestrate.sh`.
- `json_str` helper placement in `orchestrate.sh`.
- Signal priority drift in broad multi-agent phrasing.
- Kernel false positives when binary or memory home is missing.
- MMAS no-write ambiguity.
- Installer dry-run directory creation leak.

### Verified

- CI, typecheck, build, shell syntax checks, Python compile checks, and installer dry-run checks.

## [2.5.1] - 2026-06-30

### Fixed

- BundlePhobia Rspack packaging regression caused by `new URL('../package.json', import.meta.url)`.
- Replaced package version lookup with `fileURLToPath`, `dirname`, and `join`.

### Verified

- `node dist/cli.js --version` reads from `package.json`.
- Typecheck, tests, and npm pack dry run pass.

## [2.5.0] - 2026-06-30

### Added

- Vendored `agent-kernel` as a first-class component.
- Local-first memory and governance layer under `agent-kernel/`.
- Agent-kernel skill manifest, installer, wrapper, memory docs, version file, docs, examples, and development backlog.
- Memory routing path in the orchestrator.
- `./install.sh --kernel` and agent-kernel verification.
- Agent-kernel marketplace and Skills.sh entries.

### Compatibility

- Existing install paths remain additive.
- User memory under `~/.agent-kernel/` is preserved.
- No npm dependency added for the vendored kernel binary.

## [2.4.1] - 2026-06-30

### Documentation

- Replaced the stacked README badge hero with a distributed badge layout.
- Added project health, install, component, contributing, architecture, and runtime compatibility badge groups.

## [2.4.0] - 2026-06-30

### Documentation

- Reworked README badge bar into install, status, quality, ecosystem, and stack sections.
- Added dynamic badges for npm, GitHub release state, CI, Skills.sh, language, and runtime compatibility.

## [2.3.0] - 2026-06-30

### Added

- npm package release path for `delegate-team`.
- npm auto-publish workflow on version tags and manual dispatch.
- npm registry verification after publish.
- README install path for npm users.

### Fixed

- GitHub and npm package mismatch caused by oversized tarball contents.
- Reduced npm package content to the intended published surface at that time.

## [2.2.0] - 2026-06-30

### Documentation

- Polished README with structured installation paths, component breakdown, architecture diagram, usage examples, acknowledgments, and roadmap.

### CI

- Expanded CI into Node matrix, shell checks, Python checks, orchestrator routing smoke tests, and manifest validation.

## [2.1.1] - 2026-06-30

### Fixed

- Orchestrator routing false positives.

## [2.1.0] - 2026-06-30

### Added

- Skills.sh and Claude marketplace compatibility.

## [2.0.0] - 2026-06-30

### Added

- Expanded the repository from a single `dt` CLI into a complete local agent engineering system.
- Added orchestrator, scaffolder, MMAS, integrations, and installer components.
- Kept the original `dt` gateway CLI compatible.

## [1.0.0] - 2026-06-29

### Added

- Initial public release of `dt`.
- Local CLI gateway for AI coding agent delegation.
- Backend matrix: Codex, OpenCode, MiniMax, Gemini, and MetaGPT-style team.
- Failover ring across configured backends.
- Lean Token Protocol for compact routing.
- Autopilot setup with venv and credential checks.
- Skill linker for Claude Code and Gemini CLI.
