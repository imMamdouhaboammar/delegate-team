# Dispatch and poll (unified relay)

`scripts/relay.mjs` is the unified dispatch layer. It wraps any of four backend CLIs
(codex, gemini, claude/minimax, opencode/openrouter), runs the brief, captures everything,
and writes a structured `result.json`. Your job: run one command, read one file.

## Dispatching

```bash
node "<skill-dir>/scripts/relay.mjs" --backend <name> --brief brief.txt --cd /path/to/repo
```

The `--backend` flag (or first positional arg) selects the implementer:

| Backend | CLI spawned | Auth source |
|---------|-------------|-------------|
| `codex` | `codex exec` | `codex login` + `CODEX_HOME=~/.codex-delegate` |
| `gemini` | `gemini -p` | `~/.gemini/.env` (Vertex AI) |
| `minimax` | `claude -p --bare` | `~/.minimax/.env` (MiniMax key) |
| `openrouter` | `opencode run` | `~/.openrouter/.env` |

## Common flags

| Flag | Effect |
|------|--------|
| `--brief <file>` | Brief path (or pipe stdin) |
| `--cd <dir>` | Working root (default: cwd) |
| `--model <name>` | Model override |
| `--read-only` | Review/diagnosis — no edits |
| `--out-dir <dir>` | Artifact directory (default: temp) |
| `--max-retries <n>` | Auto-retry on 429 (default: 4) |
| `--retry-base-ms <ms>` | Backoff base (default: 20000 → 20s/40s/80s/160s) |

## Backend-specific flags

**Codex:** `--sandbox <mode>` (read-only/workspace-write/danger-full-access), `--resume-last`, `--skip-git-repo-check`

**Gemini:** `--approval-mode <mode>` (yolo/auto_edit/plan), `--sandbox` (OS sandbox), `--include <dir>`

**MiniMax:** `--permission-mode <mode>` (bypassPermissions/acceptEdits/plan), `--env-file <path>`

**OpenRouter:** `--model` takes provider/model (e.g. `qwen/qwen3-coder:free`)

## Auto-retry

All backends share the same outer retry: on a 429/503/RESOURCE_EXHAUSTED exit, the relay
waits (exponential backoff: 20s → 40s → 80s → 160s) and re-spawns from scratch. Non-429
failures are NOT retried. `--max-retries 0` = single-shot (old behavior). Caveat: retry
re-runs the brief against the worktree's CURRENT state — keep briefs idempotent.

## The result

`<out-dir>/result.json` — unified contract. Base fields:

- `schema` — `delegate-team.<backend>.result.v1`
- `backend` — codex / gemini / minimax / openrouter
- `status` — completed / failed / `<backend>_unavailable`
- `exitCode` — mirrors the CLI's exit; 127 if binary missing
- `model`, `cliVersion`
- `finalMessage` — the implementer's final report text
- `touchedFiles` — `git status --porcelain` lines; `null` if git unavailable; `[]` if clean
- `briefPath`, `eventsPath`, `finalPath` — artifact paths
- `startedAt`, `finishedAt`
- `stderrTail` — last ~20 stderr lines; present ONLY on failed runs

Backend-specific extras: Codex adds `threadId`, `sandbox`, `resumeLast`. Gemini adds
`approvalMode`. MiniMax adds `permissionMode`. OpenRouter adds `readOnly`.

## Waiting

The relay blocks. Back it with your orchestrator's async:

- **Claude Code:** `run_in_background: true` — notified on completion.
- **Shell:** foreground for short tasks, or `&` + poll for result.json.

A run is done when `result.json` exists AND the process exited. Usage error (bad args,
empty brief) exits 2 with NO result file. Missing binary exits 127 WITH a result file
(status `<backend>_unavailable`).

## When a run misbehaves

- **`*_unavailable` (127):** binary not on PATH. Install per the table in SKILL.md.
- **`failed`:** read `stderrTail` + `eventsPath` tail. Common: auth lapse, quota, invalid model.
- **Empty `finalMessage`:** implementer exited before producing output. Treat as failed.
- **Hung (no output for 120s — 2 consecutive 60s silent checks):** watchdog rule — kill, clean up, reroute or finish self.
