# Atlas Plan Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Atlas planner output fail closed before it can grant downstream execution to malformed, duplicate, unknown, or out-of-scope worker selections.

**Architecture:** Keep parent authority in `mmas/spawn-team.py`. Introduce a pure plan validator and a single terminal failure recorder, then call them from the existing Atlas ingestion path before any selected child worker is loaded or spawned. Use deterministic Python fixtures launched from Vitest so no external model/network is required.

**Tech Stack:** Python 3.10+, TypeScript/Vitest, GitHub Actions.

## Global Constraints

- Work only on `daily/2026-08-17-atlas-plan-validation`.
- Production scope is `mmas/spawn-team.py` only.
- Tests stay in `tests/mmas-atlas-plan-validation.test.ts`.
- Do not change routing thresholds, adapters, releases, package metadata, CI workflows, or watchdog code.
- Do not publish, deploy, merge, rotate credentials, or rewrite history.
- Existing valid Atlas plans must remain compatible.

---

### Task 1: Define the Atlas result contract

**Files:**
- Test: `tests/mmas-atlas-plan-validation.test.ts`
- Modify: `mmas/spawn-team.py`

**Interfaces:**
- Produces: `validate_team_plan(team_plan: object, available_agents: set[str]) -> tuple[list[str], dict[str, str], str]`
- Produces: `record_atlas_plan_failure(boulder_path: Path, atlas_pid: int | None, kill_grace: int, failure_type: str, detail: str) -> None`

- [x] **Step 1: Write failing tests** for malformed top-level shapes, unknown/duplicate workers, task ownership, valid normalization, and terminal failure evidence.
- [x] **Step 2: Verify RED** in GitHub Actions. Expected failure: missing validation/failure-recorder functions while existing tests remain green.
- [x] **Step 3: Implement the minimal validator** that validates shape, identities, duplicate selections, task ownership, and rationale/task types.
- [x] **Step 4: Implement terminal failure recording** with cleanup attempt, `failed` state, stop reason, failure detail, Atlas terminal state, completion timestamp, and rejection event.

### Task 2: Wire fail-closed behavior into Atlas ingestion

**Files:**
- Modify: `mmas/spawn-team.py`
- Test: `tests/mmas-atlas-plan-validation.test.ts`

**Interfaces:**
- Consumes: `validate_team_plan()` and `record_atlas_plan_failure()` from Task 1.
- Produces: no new public CLI surface.

- [x] **Step 1: Replace direct `.get()` plan extraction** with validation against current available agent identities.
- [x] **Step 2: Reject unknown/unavailable agents** instead of silently skipping them.
- [x] **Step 3: Record terminal evidence** when Atlas exits without a plan, plan parsing/validation fails, plan reading fails, or post-plan guardrails reject the team.
- [x] **Step 4: Add a deterministic command-path test** that makes fake Atlas write a malformed plan and asserts no child worker or watchdog starts.

### Task 3: Record first-run architecture evidence

**Files:**
- Create: `docs/architecture/autonomous-baseline.md`
- Create: `docs/architecture/delegation-risk-map.md`
- Create: `docs/learning/result-contract-validation.md`

**Interfaces:**
- Produces: durable baseline, risk/candidate map, and engineering lesson for future daily runs.

- [x] **Step 1: Map task intake, routing, decomposition, adapters, context, permissions, execution, parallelism, results, verification, failure recovery, CLI, persistence, security, tests, and CI.**
- [x] **Step 2: Generate at least ten candidates** and score them with the repository daily priority formula.
- [x] **Step 3: Explain why active PR overlap disqualifies otherwise useful candidates.**
- [x] **Step 4: Capture the result-contract lesson** and deterministic proof strategy.

### Task 4: Independent verification

**Files:**
- Review all PR-changed files only.

**Interfaces:**
- Consumes: PR diff and GitHub Actions results.
- Produces: Checker findings and Verifier evidence in the final daily report.

- [x] **Step 1: Checker reviews the PR diff** for scope expansion, fail-open behavior, accidental unrelated edits, and missing command-path coverage.
- [x] **Step 2: Address Checker finding** by adding deterministic `cmd_spawn_atlas()` malformed-plan coverage.
- [ ] **Step 3: Run final GitHub Actions verification** on the ending SHA and require targeted tests, CI, quality/security checks to be green or explicitly report any unrelated known failure.
- [ ] **Step 4: Update the PR description and mark it ready for review only if verification evidence is sufficient.**
