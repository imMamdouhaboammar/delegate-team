---
name: minimax-coder
description: |
  Local MiniMax-powered coding agent. Uses the official `mmx` CLI (https://github.com/MiniMax-AI/cli)
  to call MiniMax models (M3 flagship, M2.7, M2.7-highspeed) for direct single-file edits and
  multi-file autonomous work with full tool use. Sibling backend to vertex-coder inside
  delegate-team; mirrors its structure (direct + interactive + tools registry) but routes
  through mmx instead of an SDK. The Python scripts in this directory are local-agent helpers —
  Mavis (M3) can also invoke `mmx text chat` directly via bash for fast ad-hoc calls. Three
  MiniMax models supported. Use when delegating coding work to MiniMax models. Triggers on:
  "use minimax coder", "MiniMax M3", "MiniMax M2.7", "minimax direct", "minimax interactive",
  "mmx text chat". Do NOT use for trivial edits (do them locally).
---

# MiniMax Coder

> **Local MiniMax-powered coding agent.** Sibling to `vertex-coder` inside `delegate-team/`.
> Mirrors vertex-coder's structure (direct mode + interactive mode + tools registry) but
> uses the official **`mmx` CLI** for all API transport. This means:
>
> - **No Python SDK dependencies** — just `mmx` on PATH (one `npm install` away)
> - **Auth handled by `mmx`** — no key management in our Python code
> - **You (Mavis, M3) are the orchestrator** — this skill provides the scripts, but you can
>   also call `mmx text chat` directly via bash for fast ad-hoc sub-agent work
>
> **The "boss and director" pattern**: Mavis on M3 calls MiniMax models as sub-agents —
> M2.7-highspeed for fast isolated work, M3 itself for hard problems with fresh context.

## What this skill IS

1. **A direct coder** — `minimax_direct_coder.py` reads a file, sends it to a MiniMax model
   via `mmx text chat`, extracts the markdown code block, writes it back.
2. **An interactive agent** — `minimax_interactive_agent.py` runs a multi-turn tool-use loop
   with mmx, where the model can read files, grep, run commands, install deps, persist memory.
3. **A local-agent surface** — the `mmx` CLI itself is available to Mavis via bash for ad-hoc
   calls. The Python scripts here wrap common patterns but aren't required.
4. **A multi-model dispatcher** — three models supported: M3 (flagship), M2.7 (previous gen),
   M2.7-highspeed (speed-optimized). All routed through the same `mmx text chat` call.

## What this skill is NOT

- Not a replacement for `vertex-coder` (different model family — Gemini vs MiniMax).
- Not a memory tool (lives outside the Mavis memory layer).
- Not a router (use the parent `delegate-team` `dt` CLI for cross-backend dispatch).
- Not a replacement for `mmx text chat` directly — when you need a one-off query, just run
  `mmx text chat --model MiniMax-M3 --message "..."` without involving this skill's scripts.

---

## Architecture

```text
User task
   ↓
Mavis (MiniMax-M3) — orchestrator + boss
   ↓
   ├─ Direct call:    mmx text chat --model M3 --message "..."   (fast, ad-hoc)
   ├─ Direct coder:   minimax_direct_coder.py <file> <prompt>    (file → code → file)
   └─ Interactive:    minimax_interactive_agent.py <prompt>       (multi-turn + tools)
                       ↓
                    mmx CLI (handles auth, region, API)
                       ↓
                    https://api.minimax.io (Token Plan API)
                       ↓
                    MiniMax-M3 / MiniMax-M2.7 / MiniMax-M2.7-highspeed
```

---

## Available models

| Model | Description | Best for |
|---|---|---|
| `MiniMax-M3` | **Flagship** (Mavis's own runtime), 450K context, multimodal, switchable thinking | Default heavy reasoning, complex tasks |
| `MiniMax-M2.7` | Previous generation, 200K context, forced thinking | Mature reasoning, good quality/cost balance |
| `MiniMax-M2.7-highspeed` | M2.7 optimized for speed, 200K context | Fast isolated sub-tasks, batch processing |

All three are whitelisted in `~/.minimax/config.yaml` (confirmed by `inspect_settings.py`).

---

## Quick start

### Setup (one-time)

```bash
# Install mmx CLI globally
npm install -g mmx-cli

# Authenticate with your MiniMax Token Plan API key
mmx auth login --api-key sk-xxxxx

# Verify
mmx quota
```

### Usage

```bash
# Direct mode (single file)
python3 minimax_direct_coder.py src/api/auth.ts "Add JWT validation middleware" MiniMax-M3

# Interactive mode (multi-file autonomous with tool use)
python3 minimax_interactive_agent.py "Implement OAuth2 PKCE flow" MiniMax-M3 --skills test-driven-development

# Direct mmx call (fast, ad-hoc — Mavis can use this without the Python wrapper)
mmx text chat --model MiniMax-M2.7-highspeed --message "Explain async/await in 3 sentences"
mmx text chat --model MiniMax-M3 --system "You are a code reviewer" --message "Review this diff: ..."

# Read prompt from stdin
echo "Refactor for clarity" | python3 minimax_direct_coder.py src/utils.ts - MiniMax-M2.7-highspeed
```

---

## Invocation patterns

### Pattern A: Boss-and-director (M3 → M2.7)

Mavis on M3 keeps the high-level conversation. For a fast isolated subtask, spawn M2.7-highspeed.

```bash
# M3 delegates a quick refactor to M2.7-highspeed while M3 keeps thinking
python3 minimax_direct_coder.py src/refactor-target.ts "Apply this exact change..." MiniMax-M2.7-highspeed
```

### Pattern B: Self-orchestration (M3 → M3, fresh context)

Use when you want a hard problem tackled without cluttering the main Mavis session.

```bash
python3 minimax_interactive_agent.py "Solve this hard concurrency bug" MiniMax-M3 --max-turns 20
```

### Pattern C: Adversarial review (MiniMax vs Gemini)

Pair `minimax-coder` with `vertex-coder` for a second opinion from a different model family.

```bash
# MiniMax opinion
python3 minimax_direct_coder.py src/critical.ts "Review for race conditions" MiniMax-M3 > review-minimax.txt
# Gemini opinion
python3 ${DELEGATE_TEAM_ROOT}/vertex-coder/vertex_direct_coder.py src/critical.ts "Review for race conditions" gemini-3.1-pro > review-gemini.txt
# Diff
diff review-minimax.txt review-gemini.txt
```

### Pattern D: Direct mmx calls (no Python wrapper)

When you just need a quick one-off — skip the Python layer entirely.

```bash
# Simple Q&A
mmx text chat --model MiniMax-M2.7-highspeed --message "What's the capital of France?"

# With system prompt and JSON output
mmx text chat --model MiniMax-M3 --system "You are a SQL expert. Reply with just SQL." --message "Write a query to find top 10 customers by revenue" --output json

# Multi-message conversation
mmx text chat --message "What is 2+2?" --message "assistant:4" --message "And 3+3?"
```

---

## Local tools (interactive mode)

The interactive agent exposes 10 local tools via Anthropic tool-use API (mmx native):

| Tool | Purpose |
|---|---|
| `list_dir` | List directory contents |
| `read_file` | Read file contents |
| `write_file` | Create/overwrite file (sparingly) |
| `line_replace` | **PREFERRED** — surgical line-range replacement with `...` keep markers |
| `grep_search` | Regex search across workspace |
| `run_command` | Bash execution (60s default, up to 300s) |
| `save_memory` | Persist key/value to `.agent_memory.json` |
| `read_memories` | Load all persisted memories |
| `list_global_skills` | List installed skills (5 search paths) |
| `load_skill` | Load a skill's full instructions into context |

Memory file: `.agent_memory.json` (same name as vertex-coder for parity).

---

## Files in this directory

| File | Purpose |
|---|---|
| `minimax_direct_coder.py` | Single-file coder (analog of `vertex_direct_coder.py`) |
| `minimax_interactive_agent.py` | Multi-file autonomous agent (analog of `vertex_interactive_agent.py`) |
| `tools_registry.py` | Anthropic-format tool schemas + implementations |
| `list_models.py` | Model listing |
| `inspect_settings.py` | Health check (mmx CLI + auth + quota + memory) |
| `requirements.txt` | No runtime deps (Python stdlib + `mmx` CLI only) |
| `SKILL.md` | This file |
| `README.md` | Same content as SKILL.md (for `dt` integration) |

---

## Integration with Mavis / expert-engineer

When the `expert-engineer` skill is active, MiniMax Coder is invoked when:

1. **M3 wants to delegate to a MiniMax sub-agent** (boss-and-director pattern)
2. The task is MiniMax-specific (testing MiniMax APIs, integrating MiniMax tooling)
3. The user prefers MiniMax model family for any reason (consistency, cost, latency)
4. Adversarial review needs a different family (pair with vertex-coder)
5. Fast isolated sub-task — M2.7-highspeed while M3 keeps thinking

The expert-engineer SKILL.md has a "Delegate heavy coding → /delegate-team" routing section
that documents when to invoke minimax-coder vs god-agent vs vertex-coder.

**Mavis can also use `mmx text chat` directly** — no need to invoke the Python scripts for one-off queries.

---

## Cross-references

- **Sibling backends**:
  - `${DELEGATE_TEAM_ROOT}/vertex-coder/` — Gemini-based (same structure)
  - `${DELEGATE_TEAM_ROOT}/god-agent/` — Multi-CLI (codex + opencode)
- **Orchestration gateway**: `dt` CLI at `/opt/homebrew/bin/dt`
- **Mavis expert-engineer**: `~/.mavis/agents/mavis/skills/expert-engineer/SKILL.md`
- **Config source of truth**: `~/.minimax/config.yaml`
- **Auth**: `mmx auth login --api-key sk-xxxxx` (no env var or .env needed)
- **Official CLI**: https://github.com/MiniMax-AI/cli
- **Docs**: https://platform.minimax.io/docs/token-plan/minimax-cli

---

**Last updated**: 2026-06-30 — switched to `mmx` CLI transport (official, proven). Removed anthropic SDK dependency.
**Maintained by**: Mamdouh + Mavis (collaboratively).
