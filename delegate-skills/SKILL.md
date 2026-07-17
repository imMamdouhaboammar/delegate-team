---
name: delegate-skills
description: |
  First-class delegation skills for the delegate-team supersystem. Each skill lets
  an orchestrating agent hand a bounded coding task to a CLI implementer agent
  (Grok, Codex, OpenCode, Kimi, AGY), then review the diff and land it itself.
  Use when the user says "delegate this to Grok", "have Codex do X", "run it
  through opencode", or any phrasing that should drive a background implementer
  while the orchestrator stays the reviewer. Composes with `dt delegate` (the CLI
  entry point) and the /apeiron router.
license: MIT
compatibility: Requires the matching CLI installed + authenticated (e.g. `grok`
  for grok-delegate), Node 18+, and git. The orchestrating agent must be able to
  run shell commands and read files.
metadata:
  version: 1.0.0
---

# delegate-skills — delegate to a CLI implementer, review the diff yourself

This component bundles five standalone **delegate skills**. Each one wraps a
different CLI coding agent behind the same loop:

1. **Write a brief** — a self-contained task description the implementer can
   execute blind (goal, current state, what to change, what to leave untouched,
   the project's real gate commands, and a report contract).
2. **Dispatch** — hand the brief to the CLI agent via its `scripts/relay.mjs`
   helper, which captures the run and writes a structured `result.json`.
3. **Wait** — the helper blocks until the run finishes.
4. **Review** — re-run the project's gates yourself, read the diff, run guard
   skills. Never trust the self-report.
5. **Land** — the orchestrator commits the verified work. The relay never commits.

## Skills

| Skill | CLI agent | `dt delegate` agent id |
|---|---|---|
| `grok-delegate` | Grok Build (`grok`) | `grok` |
| `codex-delegate` | Codex (`codex`) | `codex` |
| `opencode-delegate` | OpenCode | `opencode` |
| `kimi-delegate` | Kimi | `kimi` |
| `agy-delegate` | AGY | `agy` |

## CLI entry point

The `dt` CLI exposes the same loop without loading a skill manually:

```bash
dt delegate grok --brief brief.txt          # default: workspace-write autonomy
dt delegate grok --brief brief.txt --read-only   # review/diagnosis
dt delegate codex --brief b.txt --model codex-1  # pass a model
dt delegate opencode --brief b.txt --cd ~/repo   # target another repo
```

`dt delegate <agent> --help` shows all flags. The command resolves
`delegate-skills/<agent>-delegate/scripts/relay.mjs` and invokes it — the relay
logic lives in the skill, not duplicated in the CLI.

## Files

- `SKILL.md` — **THIS FILE** — component manifest
- `<agent>-delegate/SKILL.md` — per-agent delegate skill
- `<agent>-delegate/references/*.md` — brief writing, dispatch, review, queues
- `<agent>-delegate/scripts/relay.mjs` — dispatch + capture helper

## Compatibility

| Agent | Status |
|---|---|
| Claude Code | ✅ via `npx skills add` |
| Cursor | ✅ via `npx skills add` |
| Codex | ✅ via `npx skills add` |
| OpenCode | ✅ via `npx skills add` |
| `dt` CLI | ✅ `dt delegate <agent>` |

## License

MIT
