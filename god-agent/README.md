# God Agent — Premium Multi-Model Coding Dispatcher

A sibling backend to [vertex-coder](../vertex-coder/) inside the `delegate-team` (`dt`)
orchestration project. Routes heavy coding tasks to whichever premium model is best for
the job, by shelling out to local CLI binaries (`codex exec`, `opencode run`).

## Why

`vertex-coder` is bound to Google's Vertex AI / Gemini models. Sometimes you want
the strongest model from a *different* family — OpenAI's GPT-5.x high, Zhipu's GLM-5.2
max, Alibaba's Qwen 3.7 max, Moonshot's Kimi K2.7 code-max, or MiniMax's M3 high-thinking.

God Agent is the unified shell for those.

## Install

No install step — `codex` and `opencode` CLIs are already on PATH (see
[AGENT_ACCESS_GUIDE.md](../AGENT_ACCESS_GUIDE.md) for setup). Make the scripts
executable:

```bash
chmod +x god_agent_direct.py god_agent_interactive.py list_models.py inspect_settings.py
```

## Health check

```bash
python3 inspect_settings.py
```

Verifies: CLIs installed, codex logged in, opencode models reachable, memory writable.

## Quick start

### Direct mode (single file)

```bash
python3 god_agent_direct.py src/api/auth.ts \
  "Add JWT validation middleware with proper error handling" \
  minimax-m3-high-thinking
```

### Interactive mode (multi-file autonomous)

```bash
python3 god_agent_interactive.py \
  "Implement OAuth2 PKCE flow across src/auth/ with full test coverage" \
  opencode-glm-5.2-max \
  --skills test-driven-development security-and-hardening
```

### From a brief file (stdin)

```bash
cat brief.md | python3 god_agent_interactive.py - minimax-m3-high-thinking
```

## Available models

| Key | CLI | Use when |
|---|---|---|
| `codex-gpt-5.5-high` | codex exec | Direct mode, OpenAI high reasoning (primary) |
| `codex-gpt-5.4-high` | codex exec | Direct mode, OpenAI fallback |
| `opencode-glm-5.2-max` | opencode run | Interactive, fast Zhipu reasoning |
| `opencode-qwen-max` | opencode run | Interactive, Alibaba max |
| `opencode-kimi-k2.7-code-max` | opencode run | Interactive, Moonshot code-specialized |
| `minimax-m3-high-thinking` | opencode run | Interactive, **Apeiron flagship** — default |

## Configuration override

`~/.config/god-agent/models.json` lets you override model flags without editing code:

```json
{
  "codex-gpt-5.5-high": { "model_flag": "gpt-5-codex-high" },
  "minimax-m3-high-thinking": { "fallback": "opencode-glm-5.2-max" }
}
```

## Security

- God Agent output is **untrusted until reviewed** by Claude Code or the human.
- It does NOT commit, push, or modify any auth/state.
- Workspace boundaries are enforced by the underlying `codex` / `opencode` CLIs.
- All credential handling stays in the host CLIs (`codex login`, `opencode providers login`).

For the controlling agent's safety contract, see
[AGENT_ACCESS_GUIDE.md](../AGENT_ACCESS_GUIDE.md).

## Integration with `dt`

Currently God Agent is standalone. To register it as a `dt run --backend god-agent`
backend, edit `src/commands/run.ts` in the parent `delegate-team` project and add a
new backend dispatch entry pointing to `god-agent/god_agent_direct.py`.

## Files

- `model_router.py` — Model registry + CLI resolution
- `god_agent_direct.py` — Single-file coder
- `god_agent_interactive.py` — Multi-file autonomous agent
- `tools_registry.py` — Local tools + persistent memory + skill loader
- `list_models.py` — Model listing with availability
- `inspect_settings.py` — Health check
- `SKILL.md` — Skill manifest (for Apeiron / Claude Code discovery)

## License

Same as parent project (MIT).
