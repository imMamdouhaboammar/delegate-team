# Delegate Token Protocol (LEANBRIEF) — shared by all *-delegate skills

Goal: minimum tokens across the orchestrator AND the implementers, without losing meaning.
Adopted instead of free-symbol "0xCOMPRESS": structured + terse, never lossy symbols. (Symbol
dictionaries drift, break parsers, and are non-deterministic across models — and they compress the
*smallest* cost. See "Where tokens actually go".)

## Where tokens actually go (optimize THIS, not message text)

Per-delegate-run cost, biggest → smallest:
1. **Implementer agentic re-feed** — every turn re-sends the whole conversation + repo context + tool
   schemas. A 19-turn run pays repo-context × 19. THIS dominates. (~80% of cost.)
2. **Test/build output** captured into the loop and re-fed each later turn.
3. **Files the implementer reads** (each read becomes permanent context, re-fed every later turn).
4. **The brief** (one-time input) and **the report** (one-time output) — small.

So compressing the brief/report (what 0xCOMPRESS targets) is the LEAST important lever. The wins are
in cutting turns, reads, and re-fed output. Rules below are ordered by real impact.

## L1 — Embed the code, kill the reads (biggest lever)

Put the exact current code (function body, type, signature) and exact file paths IN the brief. If the
implementer doesn't have to open 8 files to orient, those 8 files never enter (and never re-enter)
context. A 30-line embedded snippet is far cheaper than the model reading + re-feeding 2000 lines.
- Give file:line anchors, the verbatim block to change, and the exact replacement shape.
- Name the few files in scope; forbid wandering.

## L2 — Cap the turns

- Tests RUN AT MOST TWICE: once to confirm RED, once GREEN. State this in the brief.
- Quiet reporter: `npx vitest run --reporter=dot` (a dozen dots, not pages of per-test output).
- No exploration loops: the brief is the plan; implement, don't investigate.
- One task = one brief. Multi-step work = multiple small briefs, not one sprawling session.

## L3 — Lean harness

- opencode: always `--pure` (drops ~140k tokens of MCP/plugin tool schemas).
- codex/gemini: default harness is fine; don't add MCP servers to a delegate run.

## L4 — Structured report contract (stable JSON, not prose, not symbols)

The implementer's FINAL output must be exactly one fenced JSON object and nothing else after it:

```json
{"status":"green|red|blocked","files":["path …"],"tests":{"before":"P/T","after":"P/T"},"build":"ok|fail","lint":"no-new|N new","deviations":["…"],"left_out":["…"]}
```

- Deterministic to parse (no regex guessing), tiny output, no "Here is what I did" prose.
- `deviations` = anything done that the brief didn't ask (surface, don't hide).
- Prose explanation only if `status` is blocked/red.

## L5 — Tight scope + fences

Every brief lists DO-NOT-TOUCH paths explicitly. Smaller blast radius = smaller diff = cheaper review
(orchestrator side) and fewer files pulled into implementer context.

## L6 — Orchestrator side (my own tokens)

- Verify with `rtk` (compact test/lint/git output) — already the default here.
- Read diffs with targeted `git diff -- <path>` / `grep`, never full-file re-reads.
- Never re-read a file I just edited (Edit already confirmed it).
- Trust the report's JSON; re-run gates myself but don't re-read what the JSON already states.

## LEANBRIEF format (what I emit per task)

Terse keyed sections, no prose padding, code embedded:

```
TASK <id>: <one line>
WHY: <one line, only if non-obvious>
FILES: <exact paths in scope>
NAV: use the code graph (semantic_search_nodes / query_graph) to locate code; do NOT read whole files.
CHANGE:
  <verbatim current block> → <exact replacement / additions>
TESTS(first, must go RED→GREEN): <assertions, terse>
GATES: npx vitest run --reporter=dot ; npm run build   (lint NOT a gate)
FENCE: <do-not-touch paths>
COMMS: terse — essence only ("الزتونة"). Output = the JSON report and nothing else; no narration/recap.
REPORT: final line = the JSON contract above. No commit.
```

## v2 (2026-06-15) — tooling + terse comms (real dispatch upgrade)

- **Code-graph navigation (input saver):** `code-review-graph` is built for the repo (MCP server + hooks wired into Gemini-CLI `.gemini/settings.json` and the opencode plugin). Implementers + orchestrator should locate code via the graph (semantic_search_nodes / query_graph / detect_changes) instead of Grep/Read — keeps files out of the re-fed context (the dominant cost). Rebuilds via a git post-commit path; `code-review-graph build` to refresh manually.
- **Terse agent comms:** every brief carries the COMMS line above. Agents reply with the essence only (the JSON report) — no prose, no recap. Cuts output + keeps later-turn re-feed small.
- **Orchestrator review guards:** after a lane returns + gates pass, run the guard skills on the diff as part of review: `/clean-code-guard` (no bloat/dead code), `/test-guard` (real coverage, no skipped/empty tests), `/docs-guard` (docs match behavior). Cheap quality net before commit. (These are Claude-Code skills = orchestrator-side; delegates can't run them.)
- **rtk** for all command output (compact). Already default.
- **Hang policy:** ANY provider that hangs → diagnose the cause + fix it, don't just reroute. Precedent: Codex hung on its MCP `Auth(AuthorizationRequired)` loop → fixed by a clean `CODEX_HOME=~/.codex-delegate` (no MCP) in the relay. Watchdog every 120s on every lane.
- **graphifyy:** evaluated, SKIPPED — redundant with code-review-graph + fights macOS PEP-668. Don't reinstall.

## What this is NOT

- Not a secret symbol language. Keys stay human-readable (status/files/tests) — stable across all
  models, no dictionary to drift or forget.
- Not lossy. Ambiguous abbreviations ("_B:auth") are banned; say `jwt_expiry` not `auth`.
- Realistic saving: ~20–50% per run (mostly from L1–L3 cutting reads/turns), not the mythical 90%.
  Modern tokenizers already pack English well; the win is fewer/smaller turns, not shorter words.
