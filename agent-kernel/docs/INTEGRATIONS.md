# Integrations

## Claude Code

Run:

```bash
agent-kernel enforce install
agent-kernel sync
```

This writes:

```txt
~/.claude/CLAUDE.md
~/.claude/settings.json
```

The settings file gets SessionStart, UserPromptSubmit, PreToolUse, and PostToolUse hooks.

## Codex

Run:

```bash
agent-kernel sync
```

This writes:

```txt
~/.codex/AGENTS.md
```

## Cursor

Run per project:

```bash
agent-kernel link .
```

This writes:

```txt
.cursor/rules/00-agent-kernel.mdc
AGENTS.md
```

## Antigravity

Run per project:

```bash
agent-kernel link .
```

This writes:

```txt
.agents/agents.md
.agents/skills/README.md
```

## Gemini CLI

Global:

```bash
agent-kernel sync
```

Project:

```bash
agent-kernel link .
```

This writes `GEMINI.md`.
