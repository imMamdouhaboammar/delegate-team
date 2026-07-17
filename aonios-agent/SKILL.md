---
name: aonios-agent
description: |
  Route heavy coding tasks to premium multi-model backends (Codex GPT-5.5/5.4 high, GLM-5.2
  max, Qwen 3.7 max, Kimi K2.7 code-max, MiniMax M3 high-thinking). Mirrors vertex-coder's
  structure but shells out to local CLI binaries (codex, opencode) instead of Vertex AI.
  Two modes: direct (single-file) and interactive (multi-file autonomous with tool use).
  Use when delegating heavy code generation, debugging, or refactoring tasks to the strongest
  available model. Triggers on: "delegate to aonios agent", "use the strongest model",
  "premium model coding", "opencode glm", "codex gpt-5 high", "minimax m3 thinking",
  "aonios agent direct", "aonios agent interactive". Do NOT use for trivial edits (do them locally)
  or when the user explicitly forbids external delegation.
---

# Aonios Agent

> **Premium multi-model coding dispatcher.** Mirrors `vertex-coder`'s structure (direct
> mode + interactive mode) but routes to whichever premium model is best for the job via
> local CLI binaries. No new Python deps — uses `codex exec` and `opencode run` directly.

## What this skill IS

1. **A model router** — picks the right CLI (`codex` vs `opencode`) and the right model flag
   for the requested premium model.
2. **A direct coder** — `aonios_agent_direct.py` reads a file, sends it to a premium model,
   extracts the markdown code block, writes it back.
3. **An interactive agent** — `aonios_agent_interactive.py` hands off a multi-step task to
   a premium model with full tool access (file edit, grep, bash, dependency install).
4. **A configuration override surface** — `~/.config/aonios-agent/models.json` lets users
   customize model flags without editing code.

## What this skill is NOT

- Not a replacement for vertex-coder (different model family).
- Not a general-purpose LLM gateway (use `dt serve` for that).
- Not a code reviewer (use the `review-changes` skill).
- Not a memory tool (lives outside the Apeiron memory layer).

---

## Architecture

```text
User task
   ↓
Aonios Agent (this skill)
   ↓
model_router.resolve_model(key)
   ↓
   ├─ codex CLI  →  codex exec --model "gpt 5.5 high"      (single-turn)
   └─ opencode CLI → opencode run -m opencode-go/minimax-m3 (multi-turn + tools)
   ↓
Markdown code block (direct mode) OR streamed tool-use (interactive mode)
   ↓
File write OR diff + verification
```

---

## Available models

| Key | CLI | Model Flag | Family | Tier | Direct | Interactive |
|---|---|---|---|---|:-:|:-:|
| `codex-gpt-5.5-high` | codex | `gpt 5.5 high` | OpenAI | high | ✓ | — |
| `codex-gpt-5.4-high` | codex | `gpt 5.4 high` | OpenAI | high | ✓ | — |
| `opencode-glm-5.2-max` | opencode | `opencode-go/glm-5.2` | Zhipu | max | ✓ | ✓ |
| `opencode-qwen-max` | opencode | `opencode-go/qwen3.7-max` | Alibaba | max | ✓ | ✓ |
| `opencode-kimi-k2.7-code-max` | opencode | `opencode-go/kimi-k2.7-code` | Moonshot | code-max | ✓ | ✓ |
| `minimax-m3-high-thinking` | opencode | `opencode-go/minimax-m3` | MiniMax | high-thinking | ✓ | ✓ |

**Why codex is direct-only**: `codex exec` runs a single non-interactive turn. Multi-turn
tool use via codex requires the experimental `codex exec-server` which is not yet stable.
Use opencode-routed models for interactive work.

---

## Quick start

```bash
# Health check
python3 inspect_settings.py

# List models
python3 list_models.py

# Direct mode (single file)
python3 aonios_agent_direct.py src/api/auth.ts "Add JWT validation middleware" minimax-m3-high-thinking

# Interactive mode (multi-file)
python3 aonios_agent_interactive.py "Implement OAuth2 PKCE flow in src/auth/" opencode-glm-5.2-max \
  --skills test-driven-development security-and-hardening

# Read prompt from stdin
echo "Refactor for clarity" | python3 aonios_agent_direct.py src/utils.ts - codex-gpt-5.5-high
```

---

## Invocation patterns

### Pattern A: Surgical single-file fix

**When**: One file, clear instruction, no multi-file dependencies.

```bash
python3 aonios_agent_direct.py <file> "<instruction>" <model>
```

**Recommended model**: `minimax-m3-high-thinking` (default) — strongest reasoning for code.

### Pattern B: Multi-file refactor / feature

**When**: Touches multiple files, needs exploration, may run tests.

```bash
python3 aonios_agent_interactive.py "<task>" minimax-m3-high-thinking \
  --skills test-driven-development
```

**Recommended model**: `minimax-m3-high-thinking` for complex reasoning,
`opencode-kimi-k2.7-code-max` for code-specialized work.

### Pattern C: Fast iteration on small tasks

**When**: Quick fix, low stakes, want speed.

```bash
python3 aonios_agent_direct.py <file> "<fix>" opencode-glm-5.2-max
```

**Recommended model**: `opencode-glm-5.2-max` (fast tier).

### Pattern D: Adversarial review

**When**: Need a second opinion on tricky code.

```bash
python3 aonios_agent_direct.py <file> "Review this code for race conditions and suggest fixes" codex-gpt-5.5-high
```

**Recommended model**: `codex-gpt-5.5-high` (different family = different blind spots).

---

## Configuration override

Default model flags can be overridden via `~/.config/aonios-agent/models.json`:

```json
{
  "codex-gpt-5.5-high": {
    "model_flag": "gpt-5-codex-high"
  },
  "minimax-m3-high-thinking": {
    "fallback": "opencode-glm-5.2-max"
  }
}
```

---

## Integration with Apeiron / expert-engineer

When the `expert-engineer` skill is active, Aonios Agent is invoked when:

1. The task is heavy (multi-file, complex reasoning, broad blast radius)
2. The task benefits from premium-model reasoning (architecture, hard bugs)
3. Local iteration would be expensive (large refactor, many test cycles)

The expert-engineer SKILL.md contains a "Delegate heavy coding → Aonios Agent" routing section
that documents when to invoke this skill vs handle locally.

---

## Files in this directory

| File | Purpose |
|---|---|
| `model_router.py` | Maps model keys → CLI invocations. Single source of truth. |
| `aonios_agent_direct.py` | Single-file coder (analog of `vertex_direct_coder.py`). |
| `aonios_agent_interactive.py` | Multi-file autonomous agent (analog of `vertex_interactive_agent.py`). |
| `tools_registry.py` | Local tools inventory + persistent memory + skill loader. |
| `list_models.py` | Pretty-print model registry with backend status. |
| `inspect_settings.py` | Health check (CLIs installed, logged in, memory writable). |
| `requirements.txt` | Empty — no new Python deps (uses existing `codex` + `opencode` CLIs). |
| `README.md` | Same content as this SKILL.md (for `dt` integration). |
| `SKILL.md` | This file. |

---

## Cross-references

- **Sibling backend**: `${DELEGATE_TEAM_ROOT}/vertex-coder/` (Gemini-based)
- **Orchestration gateway**: `dt` CLI at `/opt/homebrew/bin/dt`
- **Apeiron expert-engineer**: `~/.apeiron/agents/apeiron/skills/expert-engineer/SKILL.md`
- **Global skills**: `~/.agents/skills/` (1808 skills available for `--skills` preload)

---

**Last updated**: 2026-06-30 — first version, mirrors vertex-coder structure.
**Maintained by**: Mamdouh + Apeiron (collaboratively).
