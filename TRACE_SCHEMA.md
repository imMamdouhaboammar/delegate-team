# Trace Schema

The `dt` nested orchestration architecture requires a robust trace schema to prevent circular delegation, manage cost explosions, and maintain a verifiable audit log for every task executed by the Team Orchestrator (MetaGPT).

## The Schema

Every delegation event is tracked via a JSON schema. This ensures the Supervisor (Claude Code) and the Policy Gateway (`dt`) maintain strict oversight of the execution graph.

```json
{
  "trace_id": "dt-2026-06-20-001",
  "parent_id": "claude-code-session-456",
  "controller": "claude-code",
  "executor": "metagpt",
  "depth_control": {
    "max_depth": 2,
    "current_depth": 1,
    "can_delegate": true,
    "can_call_metagpt": false
  },
  "budget": {
    "max_roles": 5,
    "max_rounds": 2,
    "max_tokens_total": 120000,
    "max_runtime_seconds": 900,
    "fallback_budget": 2
  },
  "roles": [
    {
      "role": "architect",
      "backend": "vertex-coder",
      "status": "completed",
      "files_touched": ["src/auth.ts"]
    }
  ],
  "final_status": "ready_for_review",
  "commit_allowed": false
}
```

## Critical Safeguards Implemented via Trace

### 1. Circular Delegation Prevention
**Risk**: Claude Code calls `dt`, `dt` calls MetaGPT, MetaGPT calls `dt`, leading to an infinite loop.
**Solution**: The `depth_control` object tracks the `current_depth`. Once MetaGPT is executing, `can_call_metagpt` is forced to `false`. A worker operating inside MetaGPT cannot trigger a new MetaGPT orchestration session.

### 2. Cost and Chaos Explosion Limits
**Risk**: MetaGPT spins up too many models, creating an endless feedback loop of revisions that drain API budgets and time.
**Solution**: The `budget` object strictly enforces maximum roles, rounds of execution, total token limits, and runtime timeouts. If the budget is exhausted, MetaGPT halts and returns a partial result to Claude Code. Claude Code (or the human) then decides whether to extend the budget or take over manually.

### 3. Commit Authority Flag
**Risk**: An agent hallucinates and commits broken code directly to `main`.
**Solution**: The `commit_allowed` flag is always `false` during worker execution. The trace explicitly records the state as `ready_for_review`, forcing the Supervisor to read the `files_touched` diff before any git action is permitted.
