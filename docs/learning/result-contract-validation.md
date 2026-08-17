# Result Contract Validation

## Problem encountered

The Atlas planner is a delegated worker whose output controls which workers run next. `team_plan.json` was parsed as JSON, but the parent did not validate the plan as a bounded result contract. Unknown agents could be silently skipped, malformed shapes could raise unexpected errors, and some rejection paths returned without recording terminal task evidence.

## Initial assumption

A parseable JSON file plus downstream max-agent and backend-compatibility checks might be sufficient because Atlas is only a planner.

## Actual concept

Planner output is authority-sensitive worker output. Parsing establishes syntax only; it does not establish authorization, scope, completeness, or semantic validity.

The parent must validate at least:

- top-level shape;
- required field types;
- selected worker identity;
- duplicate selections;
- task ownership;
- downstream guardrails;
- terminal state on rejection.

The safe model is:

`worker proposal -> structural validation -> scope validation -> policy validation -> parent decision -> child execution`

## Implementation

The MMAS Atlas path now normalizes and validates `team_plan.json` before loading/spawning selected agents. Invalid plans fail closed and record a structured failure reason, terminal Atlas state, completion timestamp, and rejection event. Unknown workers are rejected instead of silently skipped.

The change deliberately does not make Atlas authoritative over permissions, worker limits, or completion. Existing parent guardrails still run after structural validation.

## Failure mode

Without validation, a planner can claim one team while the parent silently executes another, or malformed output can leave durable state in a misleading non-terminal phase. This is especially dangerous in orchestration because subsequent execution authority is derived from the planner result.

## Test proving behavior

Deterministic tests cover:

- non-object plan;
- non-array team;
- non-object tasks;
- unknown worker;
- duplicate worker;
- task assigned outside selected team;
- valid normalization with Atlas excluded from downstream workers;
- terminal failure evidence;
- the full `cmd_spawn_atlas()` malformed-plan path with fake worker spawning and a watchdog that is required not to start.

No live model API is required for these scenarios.

## What to remember

Structured output is not trusted output. Any child result that changes downstream authority should be validated as a proposal against parent-owned identity, scope, policy, freshness, and evidence constraints before execution continues.
