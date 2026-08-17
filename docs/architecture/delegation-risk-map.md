# Delegate-Team Delegation Risk Map

Date: 2026-08-17
Baseline SHA: `c16e308896c1ddf5bec91ed19e2275b3a077f80c`

Scores use a 1–5 scale and the daily priority formula:

`(Delegation quality × 3) + (Reliability × 2) + Safety + User value + Architectural fit + Testability + Learning value + Integration value - Complexity - Regression risk`

Active pull-request overlap is treated as an additional practical reason not to select work, even when the raw score is high.

## Primary risks observed

| Risk | Evidence | Consequence | Current mitigation | Gap |
|---|---|---|---|---|
| Malformed Atlas result accepted too loosely | `cmd_spawn_atlas()` parsed `team_plan.json` and silently skipped unknown agents | downstream scope can differ from planner claim; task can remain non-terminal on malformed output | JSON parse + max-agent guardrail | no explicit result contract or terminal rejection evidence before this run |
| Provider credentials are broadly inherited by MMAS children | `get_clean_env()` allows several provider API keys independent of selected backend | unnecessary secret exposure to workers | filtered environment instead of full inheritance | backend-scoped credential allowlists |
| Child results lack repository freshness binding | summaries/boulder state do not carry Git SHA/file hashes | stale result can be accepted after relevant mutation | human review and task-local state | first-class freshness validation |
| Worker result schema is mostly free-form summaries | summary files are consumed as evidence | success claims may be incomplete or ambiguous | boulder metadata + logs | typed/validated result envelope |
| Cancellation is implemented but incompletely scenario-tested | process-group stop exists and one process-group test exists | orphan descendants or inconsistent terminal state on edge cases | PGID termination + stop command | deterministic propagation/partial-output tests |
| Parallelism has count bounds but no overlap planner | workers can run concurrently after sequential spawn | file conflicts/stale assumptions | max-agent guardrail | dependency/file-overlap checks or explicit sequential plan |
| Runtime policy and documentation can drift | protocol describes stronger deny-by-default controls than some executable paths | false confidence in permissions | security docs + tests | automated policy-to-runtime contract tests |
| Watchdog portability/status parsing has known defects | open issues #27/#28, with active PR #31 for status parsing | incorrect liveness/status reporting | watchdog + issue tracking | finish/review existing PRs instead of duplicating work |
| Security tests can contact real provider endpoints | open issue #35 with active PR #37 | nondeterminism and accidental network use | ongoing PR | merge/verify existing fix; do not duplicate |
| Routing threshold boundary coverage is incomplete | open issue #26 with active PR #32 | score boundary regressions | router tests + active PR | finish/review existing fix |
| CI checkout credential persistence is broader than necessary | open issue #33 with active PR #34 | credential residue during jobs | GitHub Actions isolation | finish/review active hardening PR |
| WSL compatibility has no explicit smoke contract | open issue #30 | platform-specific breakage | Linux CI | add bounded WSL/path compatibility tests when environment permits |

## Candidate initiatives

| # | Candidate | DQ | Rel | Safe | User | Fit | Test | Learn | Integr | Cx | Reg | Priority | Selection note |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Fail closed on malformed Atlas plans + terminal evidence + deterministic tests | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 4 | 2 | 2 | **48** | **Selected**: direct parent/worker contract gap, bounded scope, no active PR overlap |
| 2 | Property tests for MMAS worker-count/depth/concurrency invariants | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 4 | 3 | 2 | 44 | strong next testing candidate |
| 3 | Backend-scoped environment/credential forwarding | 4 | 5 | 5 | 4 | 5 | 4 | 4 | 4 | 3 | 3 | 42 | high safety value; needs adapter-by-adapter contract design |
| 4 | Cancellation propagation + partial-output cleanup scenarios | 5 | 5 | 5 | 4 | 5 | 4 | 5 | 4 | 4 | 3 | 45 | high value but broader process-lifecycle scope than today |
| 5 | Explicit MMAS task contract with allowed/forbidden files | 5 | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 39 | important authority boundary; medium/high design complexity |
| 6 | Repository-freshness token on worker results | 5 | 5 | 4 | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 38 | high strategic value; requires state-model changes |
| 7 | Structured worker result envelope + evidence requirements | 5 | 4 | 4 | 4 | 5 | 5 | 4 | 4 | 4 | 3 | 38 | natural follow-up after planner result validation |
| 8 | WSL/path compatibility smoke suite | 2 | 4 | 2 | 3 | 3 | 5 | 3 | 3 | 2 | 1 | 30 | issue #30; useful but lower delegation-quality leverage |
| 9 | Watchdog status parsing fix | 4 | 5 | 3 | 4 | 4 | 5 | 3 | 3 | 2 | 2 | 38 | not selected: active PR #31 already addresses this area |
| 10 | Watchdog `stat` portability fix | 3 | 4 | 2 | 4 | 4 | 4 | 3 | 3 | 2 | 2 | 33 | not selected: overlaps watchdog work and issue #27 |
| 11 | Offline-only proxy/security test transport | 3 | 5 | 5 | 4 | 4 | 5 | 3 | 4 | 3 | 2 | 39 | not selected: active PR #37 already addresses issue #35 |
| 12 | OpenCode routing threshold boundary tests | 4 | 4 | 2 | 4 | 5 | 5 | 3 | 4 | 2 | 1 | 38 | not selected: active PR #32 already addresses issue #26 |
| 13 | Disable persisted checkout credentials in CI | 2 | 4 | 5 | 3 | 4 | 4 | 3 | 4 | 2 | 2 | 31 | not selected: active PR #34 already addresses issue #33 |

## Selected initiative contract

**Goal:** Reject malformed or ambiguous Atlas team plans before any child worker is selected, and persist a terminal, inspectable failure state.

**Allowed production scope:**

- `mmas/spawn-team.py`

**Allowed test scope:**

- `tests/mmas-atlas-plan-validation.test.ts`

**Documentation scope:**

- `docs/architecture/**`
- `docs/learning/**`
- `docs/superpowers/plans/**`

**Forbidden scope for this run:**

- routing thresholds
- delegate adapters
- package/version/release files
- `.github/workflows/**`
- watchdog fixes already covered by open PR work
- publishing, merging, deployment, credential changes

**Permissions:** repository branch writes and PR creation only. No package publication, release, deployment, secret mutation, history rewrite, or merge.

**Context boundary:** current `master` state at the starting SHA; inspected implementation files and relevant open GitHub work. Do not copy unrelated repository content into worker contracts.

**Acceptance criteria:**

1. non-object plan, non-array `team`, and non-object `tasks` are rejected;
2. unknown agents and duplicate agents are rejected rather than silently skipped;
3. tasks cannot be assigned to unselected agents;
4. valid plans normalize Atlas out of the child team and preserve bounded task assignments;
5. malformed plans produce terminal `failed` state, a failure type/detail, Atlas terminal state, and an inspectable rejection event;
6. planner exit without a plan and post-plan guardrail failure also leave terminal evidence;
7. existing valid MMAS behavior remains compatible;
8. targeted tests and repository CI pass before the PR is declared ready.

## Best next candidates after this run

1. Backend-scoped credential/environment forwarding.
2. Cancellation propagation and partial-output cleanup scenarios.
3. Repository freshness binding for child evidence.
