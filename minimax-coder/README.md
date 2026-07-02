# MiniMax Coder — Local MiniMax-Powered Coding Agent

A sibling backend to [vertex-coder](../vertex-coder/) inside the `delegate-team` (`dt`)
project. **Mirrors vertex-coder's structure exactly** (direct mode + interactive mode +
tools registry) but uses the official **`mmx` CLI** for all API transport.

## The "boss and director" pattern

You (Mavis) run on **MiniMax-M3**. This skill lets you call MiniMax models as sub-agents:
- Delegate a quick refactor to **M2.7-highspeed** while you keep thinking
- Spawn a fresh **M3** context window for a hard isolated problem
- Get an adversarial **M3** review while **gemini-3.1-pro** reviews the same code
- Run three MiniMax models in parallel and compare outputs

All from inside your own agent loop, using `mmx text chat` directly OR the Python helpers.

## Install

```bash
# Install the official mmx CLI
npm install -g mmx-cli

# Authenticate with your Token Plan API key
mmx auth login --api-key sk-xxxxx

# Verify
mmx quota

# Optional: install PyYAML for inspect_settings.py to parse ~/.minimax/config.yaml
pip install PyYAML
```

## Health check

```bash
python3 inspect_settings.py
```

Verifies: mmx CLI installed, authenticated, quota available, config whitelist aligned, memory writable.

## Quick start

### Direct mode (single file)

```bash
python3 minimax_direct_coder.py src/api/auth.ts \
  "Add JWT validation middleware with proper error handling" \
  MiniMax-M3
```

### Interactive mode (multi-file autonomous)

```bash
python3 minimax_interactive_agent.py \
  "Implement OAuth2 PKCE flow across src/auth/ with full test coverage" \
  MiniMax-M3 \
  --skills test-driven-development security-and-hardening
```

### From a brief file (stdin)

```bash
cat brief.md | python3 minimax_interactive_agent.py - MiniMax-M3
```

### Direct mmx calls (no Python wrapper)

When you just need a quick one-off, skip the Python layer entirely:

```bash
# Quick Q&A
mmx text chat --model MiniMax-M2.7-highspeed --message "Explain async/await in 3 sentences"

# With system prompt
mmx text chat --model MiniMax-M3 --system "You are a code reviewer" --message "Review this diff"

# Multi-message conversation
mmx text chat --message "What is 2+2?" --message "assistant:4" --message "And 3+3?"
```

## Available models

| Model | Description |
|---|---|
| `MiniMax-M3` | Flagship (Mavis's own runtime), 450K context, multimodal, switchable thinking |
| `MiniMax-M2.7` | Previous gen, 200K context, forced thinking |
| `MiniMax-M2.7-highspeed` | M2.7 optimized for speed |

## Invocation patterns

| Pattern | Use when |
|---|---|
| Boss-and-director (M3 → M2.7) | M3 keeps high-level conversation, spawns M2.7 for fast subtask |
| Self-orchestration (M3 → M3 fresh context) | Tackle hard problem without cluttering main session |
| Adversarial review (MiniMax vs Gemini) | Pair with vertex-coder for different-model-family review |
| Direct mmx calls | Quick one-off queries, no Python wrapper needed |

## Local tools (interactive mode)

10 tools exposed via Anthropic tool-use API:
- `list_dir`, `read_file`, `write_file`, `line_replace`, `grep_search`
- `run_command` (60s default, up to 300s)
- `save_memory`, `read_memories` (`.agent_memory.json`)
- `list_global_skills`, `load_skill` (loads from 5 skill search paths)

## Security

- All output is **untrusted until reviewed** by Claude Code / the human.
- The agent does NOT commit, push, or modify any auth/state.
- Auth handled by `mmx` CLI (set up via `mmx auth login`, never paste keys in chat).
- Workspace boundaries enforced by the agent's own prompt + tool design.

For the controlling agent's safety contract, see
[AGENT_ACCESS_GUIDE.md](../AGENT_ACCESS_GUIDE.md).

## Files

- `minimax_direct_coder.py` — Single-file coder
- `minimax_interactive_agent.py` — Multi-file autonomous agent
- `tools_registry.py` — Anthropic-format tool schemas + implementations
- `list_models.py` — Model listing
- `inspect_settings.py` — Health check
- `requirements.txt` — No runtime deps (Python stdlib + `mmx` CLI only)
- `SKILL.md` — Skill manifest (for Mavis / Claude Code discovery)

## License

Same as parent project (MIT).
