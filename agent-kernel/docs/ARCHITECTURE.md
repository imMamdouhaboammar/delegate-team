# Architecture

Agent Kernel has five layers.

## 1. Source of truth

The source lives in `~/.agent-kernel/source`:

```txt
rules.json
memories.json
skills.json
policies.json
```

These files are the only approved source. Generated files must not be edited by agents.

## 2. Compiler

`agent-kernel compile` converts the source into agent-readable formats:

```txt
dist/AGENTS.md
dist/CLAUDE.md
dist/cursor-rule.mdc
dist/antigravity-agents.md
dist/GEMINI.md
dist/SKILLS.md
dist/policy.json
```

`AGENTS.md` is treated as the shared agent language. `CLAUDE.md`, Cursor rules, Antigravity rules, and Gemini instructions are adapters.

## 3. Sync

`agent-kernel sync` copies generated global files into:

```txt
~/.codex/AGENTS.md
~/.claude/CLAUDE.md
~/.gemini/GEMINI.md
```

Existing non-generated files are backed up before replacement.

## 4. Project link

`agent-kernel link .` writes project-local agent bridge files:

```txt
AGENTS.md
.cursor/rules/00-agent-kernel.mdc
.agents/agents.md
.agents/skills/README.md
GEMINI.md
```

This gives GUI-first agents a project-local context file even when they do not read global config.

## 5. Enforcement

Enforcement is separate from context.

```txt
SessionStart hook       injects shared context
UserPromptSubmit hook   captures explicit memory triggers
PreToolUse hook         blocks dangerous commands or protected writes
PostToolUse hook        scans edited files after writes
git pre-commit          blocks staged violations
agent-kernel guard      runs policy scan manually or in CI
```

## Why not only AGENTS.md?

Markdown instructions are useful but not strict. A coding agent can ignore, forget, compress, or misread them. Enforcement must happen outside the model through hooks, scanners, and repository gates.
