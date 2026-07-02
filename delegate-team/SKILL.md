---
name: delegate-team
description: >-
  Dispatch bounded coding tasks to a team of external implementers (Codex, Gemini, MiniMax,
  OpenRouter, OpenCode-go, VertexCoder) via a unified relay, then review and land. One skill,
  six backends, same loop. Use when "have X do this", "delegate to Y", "dispatch this", or any
  phrasing that asks to hand implementation work to an external agent. Covers the full brief →
  dispatch → wait → review → commit cycle. DO NOT USE for tasks small enough to do inline.
---

# Delegate Team — Unified Multi-Backend Dispatch

You are the **orchestrator**. This skill hands a bounded coding task to a separate
**implementer** — one of six external backends — then you review what it produced and land
it yourself. You write the brief and own the judgment; the implementer does the typing; you
verify and commit.

All six backends share the same loop, the same brief format, the same review checklist,
and the same commit boundary. Only the CLI and auth differ. Pick the backend that fits the
task; the relay handles the rest.

## Available backends

| Backend | CLI / Runtime | Default model | Auth location | Best for |
|---------|--------------|---------------|---------------|----------|
| **codex** | `codex exec` | gpt-5.5 (router picks) | `~/.codex-delegate/config.toml` | Heavy backend, correctness, events, migrations-draft |
| **minimax** | `claude -p --bare` | MiniMax-M3 | `~/.minimax/.env` (ANTHROPIC_API_KEY) | UI/React, docs, diversity, third opinion |
| **opencode** | `opencode run` | opencode-go/deepseek-v4-pro | `~/.local/share/opencode/auth.json` | APIs, coding tasks, 4-tier smart router (qwen3.7-max / kimi-k2.7-code / deepseek-v4-pro / glm-5.2) |
| **vertexcoder** | Python SDK | gemini-3.5-flash (router picks) | gcloud active account | Multi-file coding, high RPM stable (15 parallel no 429), project `<your-gcp-project-id>` |
| **gemini** | `gemini -p` | CLI configured default | `~/.gemini/.env` (Vertex AI, 8-account rotation) | Last resort — preview model quota low, 429-prone |
| **openrouter** | `opencode run` | claude-sonnet-latest | `~/.openrouter/.env` | Cheap/fast, 335+ models, fallback only |

## Dispatch matrix (which backend for which task)

**Default priority order: Codex → MiniMax → OpenCode → VertexCoder → Gemini**

| Task type | Primary | Secondary | Notes |
|-----------|---------|-----------|-------|
| UI / React | MiniMax-M3 | VertexCoder-Flash | MiniMax proven great at UI |
| Lite backend / glue | **self** or opencode/glm-5.2 | VertexCoder-Flash | Small glue = SELF (cheap, no repo re-feed) |
| Heavy backend logic | **self (Opus)** | Codex/gpt-5.5 | Absolute-correctness work stays with orchestrator |
| APIs (build/connect) | opencode/kimi-k2.7-code | VertexCoder-Flash | |
| DBs & migrations | **self (apply live)** + delegate to draft | — | Migrations need live psql apply = SELF; delegate can draft SQL |
| Documentation | MiniMax-M3 | VertexCoder-Flash | Cheap, big context |
| Events / webhooks | Codex | VertexCoder-Pro | Codex reliable (clean CODEX_HOME) |
| Complex long multi-step | VertexCoder-Pro | Codex | VertexCoder stable at high RPM, no 429 |
| Multi-file coding | VertexCoder | opencode/kimi-k2.7-code | VertexCoder: explore+write+run loop native |

**Reliability overrides:**
- Codex: RELIABLE (fixed via clean `CODEX_HOME=~/.codex-delegate`, no MCP). Primary for heavy correctness work.
- MiniMax: occasional duds (exit 0, zero files). Dud detection triggers immediate fallback.
- OpenCode: STABLE — 4-tier smart router (qwen3.7-max → kimi-k2.7-code → deepseek-v4-pro → glm-5.2).
- **VertexCoder: MOST STABLE** — Python SDK, project `<your-gcp-project-id>`, 15 parallel calls no 429. Preferred over Gemini CLI.
- Gemini CLI: **LAST RESORT** — preview model quota very low (~2-5 RPM global), 429-prone. 8-account rotation helps but not reliable under load.
- OpenRouter: free tier flaky + rate-limited. Fallback only.
- SELF: always final fallback. Also primary for small glue + migrations + security-sensitive wiring.

## Orchestrator rules (MANDATORY — read before every dispatch)

### Rule 1: Task-level retry (implementer failures are NORMAL)

Implementers fail for technical reasons: 429 quota, network drops, auth expiry, hung
processes, CLI crashes, model refusals, partial output (exit 0 but zero files written).
**These are expected, not exceptional.** The orchestrator MUST handle them:

1. **On dispatch failure (non-zero exit / empty touchedFiles / status=failed):**
   - Read `result.json` → `stderrTail` + `finalMessage` to classify the failure.
   - **Transient (429/503/quota/timeout):** the relay already retried 4x internally.
     If still failed → wait 60s → re-dispatch the SAME brief to the SAME backend.
     If second attempt fails → reroute to the Secondary backend from the dispatch matrix.
   - **Auth/config (credential expired, binary missing):** DO NOT retry. Report to user.
   - **Implementer bug (wrong output, scope creep, tests red):** send a delta brief
     with the correction (Codex: `--resume-last`; others: fresh brief stating current
     state + what to fix). Up to 2 rework rounds before finishing self.
   - **Hung/silent (no output for 120s):** kill, clean worktree, reroute or finish self.

2. **On "success" with zero work (MiniMax dud pattern — exit 0, touchedFiles=[]):**
   - This is a FAILURE. The implementer ran but produced nothing.
   - Immediately reroute to Secondary backend. Do NOT wait or re-dispatch same backend.

3. **Max retry budget per task:** 1 retry on same backend + full fallback chain (Rule 4).
   After chain exhausted → finish task yourself. Execution NEVER stops.

### Rule 4: Fallback chain (execution MUST NOT stop)

Every backend has a circular fallback chain. When a backend fails (after 1 same-backend
retry), the orchestrator MUST immediately reroute to the NEXT backend in the chain.
Walk the full chain before giving up to SELF.

**Fallback rings by starting backend:**

| Start | → 1st fallback | → 2nd fallback | → 3rd fallback | → 4th fallback | → Last resort |
|-------|----------------|----------------|----------------|----------------|---------------|
| **Codex** | MiniMax | OpenCode | VertexCoder | Gemini | **SELF** |
| **MiniMax** | Codex | OpenCode | VertexCoder | Gemini | **SELF** |
| **OpenCode** | Codex | MiniMax | VertexCoder | Gemini | **SELF** |
| **VertexCoder** | Codex | MiniMax | OpenCode | Gemini | **SELF** |
| **Gemini** | VertexCoder | Codex | MiniMax | OpenCode | **SELF** |
| **OpenRouter** | VertexCoder | Codex | MiniMax | OpenCode | **SELF** |

**Algorithm:**

```
chain = FALLBACK_RING[startBackend]   // e.g. gemini → [minimax, codex, openrouter]
for each backend in [startBackend, ...chain]:
    result = dispatch(backend, brief)
    if result.status == "completed" AND result.touchedFiles.length > 0:
        return result                 // SUCCESS — exit chain
    if isAuthError(result):
        skip                          // don't retry auth failures, try next
    if isTransient(result):
        result2 = dispatch(backend, brief)  // 1 same-backend retry
        if result2.status == "completed":
            return result2
    // backend failed → continue to next in chain
// All backends failed → SELF finishes the task
log("All backends exhausted for task <id>. Finishing SELF.")
finish_self(brief)
```

**Rules:**
- **Skip, don't retry auth failures** — if backend has expired creds or missing binary,
  jump straight to next in chain. No point retrying what can't auth.
- **1 same-backend retry for transient failures only** (429/503/quota). Then move on.
- **Dud detection** — exit 0 but touchedFiles=[] is a FAILURE. Move to next immediately.
- **Brief must be idempotent** — each backend in the chain may see a partially-edited
  worktree from the previous attempt. The brief must handle this (check if file exists
  before creating, etc.).
- **SELF is ALWAYS the final fallback** — the orchestrator can always do the work itself.
  Execution NEVER stops.
- **Log every hop** — when falling to next backend, log: `"⚠ <backend> failed (<reason>).
  Falling back to <next_backend>."` This creates an audit trail.

**Task-type affinity in fallback selection:**

The dispatch matrix (above) already ranks backends by task type. The fallback chain
RESPECTS this ranking — the 1st fallback is always the task type's Secondary from the
dispatch matrix when possible:

| Task type | Preferred chain |
|-----------|----------------|
| UI/React | MiniMax → **VertexCoder-Flash** → Codex → OpenCode → Gemini |
| Heavy backend | Codex → **VertexCoder-Pro** → OpenCode/kimi → MiniMax → Gemini |
| APIs | OpenCode/kimi → **VertexCoder-Flash** → Codex → MiniMax → Gemini |
| Docs | MiniMax → **VertexCoder-Flash** → OpenCode → Codex → Gemini |
| Events | Codex → **VertexCoder-Pro** → OpenCode → MiniMax → Gemini |
| Multi-file coding | VertexCoder → **Codex** → OpenCode/kimi → MiniMax → Gemini |

When the generic ring and task-type affinity conflict, **task-type affinity wins**.

### Rule 2: 60-second watchdog (MANDATORY on every bg dispatch)

After EVERY `run_in_background: true` dispatch, the orchestrator MUST set a 60s watchdog
cycle. Implementation:

```
Dispatch implementer (run_in_background: true)
  ↓
Every 60s until completion notification:
  1. Check: has the process produced new output since last check?
     - Read tail of eventsPath / check file mtime / ps aux | grep <backend>
  2. If YES → reset timer, continue waiting.
  3. If NO new output for 120s (2 consecutive silent checks):
     → Assume HUNG. Kill process, clean up, reroute or finish self.
  4. If completion notification arrives → proceed to Review (step 4).
```

**How to implement in Claude Code:**
- After the bg Bash call, use `ScheduleWakeup` at 60s intervals OR pair the dispatch
  with a `Monitor` / `sleep 60 && check` watchdog command.
- The 60s check is CHEAP (one file read or ps check). The cost of NOT checking =
  18-minute duds (MiniMax incident) or silent hangs burning quota.

**"متخليش الموظفين بتوعك شغالين بدون ما تراجع شغلك كل 60 ثانية"**

### Rule 3: Dispatch checklist (run mentally before every dispatch)

Before dispatching ANY task to ANY backend:
- [ ] Brief is self-contained (LEANBRIEF format, all context embedded)?
- [ ] Gates commands are the project's REAL commands (not assumed)?
- [ ] FENCE paths listed (what NOT to touch)?
- [ ] Watchdog plan ready (how will I check in 60s)?
- [ ] Failure plan ready (which secondary backend if this fails)?
- [ ] Brief is idempotent (safe to re-run on a partially-edited worktree)?

## The loop (same for all backends)

Five steps per task. Steps 1, 4, 5 are your judgment; 2 and 3 are mechanical.

### 1. Write the brief

The implementer sees **only** the brief text — no chat history, no repo memory. Everything
the task needs goes in the brief. Use the LEANBRIEF format:

```
TASK <id>: <one line>
WHY: <one line, only if non-obvious>
FILES: <exact paths in scope>
NAV: use the code graph (semantic_search_nodes / query_graph) to locate code; do NOT read whole files.
CHANGE:
  <verbatim current block> → <exact replacement / additions>
TESTS(first, must go RED→GREEN): <assertions, terse>
GATES: npx vitest run --reporter=dot ; npm run build
FENCE: <do-not-touch paths>
COMMS: terse — essence only. Output = the JSON report and nothing else; no narration/recap.
REPORT: final line = the JSON contract below. No commit.
```

Report contract (implementer's final output = ONE fenced JSON):
```json
{"status":"green|red|blocked","files":["path …"],"tests":{"before":"P/T","after":"P/T"},"build":"ok|fail","lint":"no-new|N new","deviations":["…"],"left_out":["…"]}
```

Full guidance: [references/writing-the-brief.md](references/writing-the-brief.md).

### 2. Dispatch

```bash
node "<skill-dir>/scripts/relay.mjs" --backend <name> --brief brief.txt --cd /path/to/repo
```

`<skill-dir>` is this skill's directory (the folder containing this SKILL.md).

**Backend-specific examples:**

```bash
# Codex (default sandbox=workspace-write)
node relay.mjs --backend codex --brief brief.txt --cd /repo
node relay.mjs --backend codex --brief brief.txt --cd /repo --resume-last

# MiniMax (default permission=bypassPermissions)
node relay.mjs --backend minimax --brief brief.txt --cd /repo
node relay.mjs --backend minimax --brief brief.txt --cd /repo --model MiniMax-M2.5-highspeed

# OpenCode-go (smart 4-tier router: qwen3.7-max / kimi-k2.7-code / deepseek-v4-pro / glm-5.2)
node relay.mjs --backend opencode --brief brief.txt --cd /repo
node relay.mjs --backend opencode --brief brief.txt --cd /repo --model opencode-go/kimi-k2.7-code

# VertexCoder (PREFERRED — Python SDK, Vertex AI, high RPM stable, no 429)
node relay.mjs --backend vertexcoder --brief brief.txt --cd /repo
node relay.mjs --backend vertexcoder --brief brief.txt --cd /repo --model gemini-3.1-pro
node relay.mjs --backend vertexcoder --brief brief.txt --cd /repo --vertex-project <your-gcp-project-id>

# Gemini CLI (last resort — 429-prone, but has 8-account rotation)
node relay.mjs --backend gemini --brief brief.txt --cd /repo
node relay.mjs --backend gemini --brief brief.txt --cd /repo --model gemini-3.5-flash

# OpenRouter (fallback, 335+ models)
node relay.mjs --backend openrouter --brief brief.txt --cd /repo
node relay.mjs --backend openrouter --brief brief.txt --cd /repo --model openai/gpt-oss-120b:free

# Any backend: review-only
node relay.mjs --backend vertexcoder --brief brief.txt --cd /repo --read-only
```

Common flags: `--max-retries <n>` (default 4), `--retry-base-ms <ms>` (default 20000).

### 3. Wait for completion

The relay blocks until the implementer finishes. Background it and resume on notify:

- **Claude Code:** `run_in_background: true` on the Bash call.
- **Shell:** `node relay.mjs … &` and poll for `result.json`.

Done when `result.json` exists with a `status` and the process exited.

### 4. Review — do not trust the self-report

- **Re-run the project gates yourself.** The self-report is a claim, not evidence.
- **Read the diff** against the brief (`touchedFiles` is your starting point).
- **Run guard skills** on the diff: `/clean-code-guard`, `/test-guard`, `/docs-guard`.
- For schema changes: round-trip. For removals: grep for danglers.

Full checklist: [references/review-and-land.md](references/review-and-land.md).

### 5. Land it

The relay never commits. **The orchestrator commits** after gates pass and the diff holds.
If it needs changes, send a new brief (Codex supports `--resume-last`; others = fresh brief
stating current state + delta).

## Token protocol (LEANBRIEF)

Dominant cost = implementer's agentic re-feed (~80%), NOT the brief text. Optimize:

- **L1** Embed exact code + file:line in the brief → implementer reads ~0 extra files.
- **L2** Cap turns: tests RED+GREEN once, `--reporter=dot`, no exploration.
- **L3** Lean harness: opencode `--pure`, no MCP in delegate runs.
- **L4** Structured JSON report (no prose).
- **L5** Tight scope + explicit FENCE paths.
- **L6** Orchestrator: rtk for output, targeted diffs, never re-read edited files.

Full protocol: [references/token-protocol.md](references/token-protocol.md).

## Parallel execution (git worktrees)

Run multiple implementers at once on DISJOINT-file tasks:

```bash
git worktree add -b wt-a ../wt-a HEAD
git worktree add -b wt-b ../wt-b HEAD
ln -s <repo>/node_modules ../wt-a/node_modules
ln -s <repo>/node_modules ../wt-b/node_modules
# dispatch each with --cd ../wt-a and --cd ../wt-b
# after review: git merge --no-ff wt-a wt-b, run full suite, remove worktrees
```

Each task must write NEW files only — never append to shared hot files.

## Prerequisites (per backend)

| Backend | Binary | Auth |
|---------|--------|------|
| codex | `codex --version` | `codex login` + `~/.codex-delegate/config.toml` (clean home, no MCP) |
| minimax | `claude --version` | `~/.minimax/.env` (chmod 600) with ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY (automatically unsets/cleans all Google/Vertex/GCP/GenAI environment variables to enforce direct routing) |
| opencode | `opencode --version` | `~/.local/share/opencode/auth.json` (opencode-go API key) |
| vertexcoder | `/…/.venv/bin/python3 --version` + script exists | `gcloud auth` active account with Vertex AI access on `<your-gcp-project-id>` |
| gemini | `gemini --version` | `~/.gemini/.env` with GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION |
| openrouter | `opencode --version` | `~/.openrouter/.env` + openrouter.ai/settings/privacy enabled |

## Non-negotiables

- **Re-run the gates yourself.** The self-report is a claim, not evidence.
- **The orchestrator commits, never the implementer.** The relay forbids it.
- **One task = one brief = one commit.** Split unrelated work.
- **Trust the working tree and process state** over any progress line.
- **Watchdog every 60s.** No unmonitored delegates.

## result.json contract

All backends write the same base fields plus backend-specific extras:

```json
{
  "schema": "delegate-team.<backend>.result.v1",
  "backend": "<name>",
  "status": "completed | failed | <backend>_unavailable",
  "exitCode": 0,
  "model": "...",
  "cliVersion": "...",
  "finalMessage": "...",
  "touchedFiles": ["M file.ts", ...],
  "briefPath": "/tmp/.../brief.txt",
  "eventsPath": "/tmp/.../events.jsonl",
  "resultPath": "/tmp/.../result.json",
  "startedAt": "...",
  "finishedAt": "..."
}
```

## Trust and safety

`scripts/relay.mjs` makes no network calls, reads no credentials into memory beyond the
backend's dotfile, has no dependencies (Node built-ins only), and shells out only to the
backend CLI + git. Credentials are injected into the child env only — never argv, never a
tracked file, never logged. Default modes let implementers run tools autonomously; use
`--read-only` to restrict. Always review the diff before committing.

## References

- [references/writing-the-brief.md](references/writing-the-brief.md) — brief structure, LEANBRIEF format, examples
- [references/review-and-land.md](references/review-and-land.md) — review checklist, commit boundary, rework cycle
- [references/dispatch-and-poll.md](references/dispatch-and-poll.md) — relay flags, result.json, backgrounding
- [references/multi-task-queues.md](references/multi-task-queues.md) — sequential queues, progress files
- [references/token-protocol.md](references/token-protocol.md) — LEANBRIEF token-efficiency protocol
