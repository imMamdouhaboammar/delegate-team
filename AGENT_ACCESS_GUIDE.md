# Agent Access Guide

This file is **operating guidance for the controlling agent** (Claude Code, Cursor, or any
supervisor driving `dt`). It is not a system-prompt override and not a request to bypass
the user's approval. Read this before telling a user "backend X isn't available."

When `dt doctor` (or `dt run --backend <name>`) reports a backend as not ready, the
controlling agent MUST guide the user through granting access itself, rather than
silently skipping the backend or asking the user to "go figure it out." Use the
per-backend instructions below. Never ask the user to paste a secret into chat —
direct them to set it in their own shell/config so it never enters the conversation
transcript.

## General rule

1. Run `dt doctor` to see which backends are unconfigured.
2. For each missing backend the task needs, tell the user exactly which CLI to install
   and which command grants access (login or env var).
3. Never read, log, or echo the resulting credential file/env var back to the user or
   into any `dt` trace. Confirm success via the backend's own `--version`/`whoami`
   command, not by inspecting the secret.
4. After the user confirms, re-run `dt doctor` to verify the backend flipped to ready.

## Per-backend setup

### Codex (OpenAI Codex CLI)
- Install: `npm install -g @openai/codex` (or the official Codex CLI install method).
- Grant access: `codex login` — opens a browser OAuth flow. For a second/secondary
  account, use a separate `CODEX_HOME` directory and pass `--account secondary` to `dt`.
- Verify: `codex --version` and a successful `codex login status`.

### MiniMax
- Install: per MiniMax CLI/SDK docs.
- Grant access: export `MINIMAX_API_KEY` (and `MINIMAX_GROUP_ID` if required) in the
  user's shell profile (`~/.zshrc` / `~/.bashrc`), not inline in chat.
- Verify: the configured `dt` MiniMax adapter responds to a trivial prompt without an
  auth error.

### GLM (Zhipu AI / ChatGLM)
- Install: the official GLM CLI or SDK per Zhipu's docs.
- Grant access: export `GLM_API_KEY` (or `ZHIPUAI_API_KEY`, depending on SDK version)
  in the shell profile.
- Verify: a minimal API call succeeds (no 401/403).

### OpenCode
- Install: per the OpenCode CLI's official install instructions.
- Grant access: `opencode auth login` or the equivalent device-code flow; OpenCode
  may also need a model-provider key (e.g. an Anthropic/OpenAI key) configured
  separately inside OpenCode's own config.
- Note: OpenCode is known to be fragile on paths containing spaces — if the project
  path has spaces, confirm OpenCode resolves it correctly before relying on it.

### OpenRouter
- Install: no CLI required — OpenRouter is accessed via API key only.
- Grant access: create a key at OpenRouter's dashboard and export it as
  `OPENROUTER_API_KEY` in the shell profile.
- Verify: a request against `https://openrouter.ai/api/v1/models` (or the configured
  adapter's health check) returns 200.

### Gemini (Gemini CLI)
- Install: `npm install -g @google/gemini-cli` (or official method).
- Grant access: `gemini login` for OAuth, or export `GEMINI_API_KEY` for API-key mode.
- Verify: `gemini --version` plus a successful auth check.

### Vertex AI (VertexCoder)
- Install: `gcloud` CLI, then `dt setup` to provision the local Python venv for
  VertexCoder.
- Grant access: `gcloud auth login` followed by `gcloud auth application-default login`,
  and set `GOOGLE_CLOUD_PROJECT` to the target project. The user needs Vertex AI API
  enabled and IAM permission (e.g. `roles/aiplatform.user`) on that project.
- Verify: `gcloud auth list` shows an active account, and `dt run --backend vertexcoder`
  on a trivial prompt succeeds.

## What NOT to do

- Do not ask the user to paste an API key or token directly into the chat/agent
  transcript — credentials typed into a coding-agent conversation can leak into logs.
- Do not store credentials inside the repo, inside `dt` trace files, or inside any
  generated brief/result file.
- Do not attempt to read another tool's existing credential store (e.g. another CLI's
  token cache) on the user's behalf — only the user-run login command should populate it.
- Do not silently fall back to a different backend without telling the user why the
  requested one was skipped.
