# Agent Kernel

Local-first governance kernel for AI coding agents

Agent Kernel gives Claude Code, Codex, Cursor, Antigravity, Gemini CLI, and similar tools a shared local constitution, JSON-first memories, an approval inbox for new rules, generated agent files, Claude hooks, git hooks, and deterministic policy checks

It is designed for one problem: you should not have to repeat the same standards to every coding agent in every session

## What changed in v0.0.5

- Moved memories to a JSON-first layout under `source/memories/`
- Added JSON Schema files under `source/schemas/`
- Added `agent-kernel validate`
- Added `agent-kernel migrate json`
- Added `agent-kernel memory list`, `memory search`, and `memory show`
- Added episodic memory archive inspired by conversation recall workflows
- Added `agent-kernel episode add`, `episode sync`, `episode search`, `episode show`, `episode stats`, and `episode reindex`
- Added MCP tools for searching, reading, capturing, and syncing episodes
- Added a Claude `~/.claude/hooks/session-end` helper that runs lightweight episode sync when enforcement is installed
- Added backward compatibility for the older flat files from v0.0.1
- Kept generated agent files as Markdown because agents read instructions better as text
- Kept logs as JSONL because append-only event logs should not rewrite large JSON arrays

## Install from this zip

```bash
cd agent-kernel
npm link
agent-kernel init --sync --enforce
agent-kernel doctor
```

Alternative without global linking:

```bash
cd agent-kernel
node dist/cli.mjs init
node dist/cli.mjs doctor
```

## Recommended first run

```bash
agent-kernel init --sync --enforce
agent-kernel validate
agent-kernel doctor
```

## Link a project

```bash
cd ~/Projects/YourProject
agent-kernel link . --hooks
```

This creates or updates:

```txt
AGENTS.md
.cursor/rules/00-agent-kernel.mdc
.agents/agents.md
.agents/skills/README.md
GEMINI.md
.git/hooks/pre-commit, if --hooks is passed
```

## JSON-first memory layout

```txt
~/.agent-kernel/
  config.json
  source/
    memories/
      rules.json
      preferences.json
      workflows.json
      project-notes.json
      skills.json
    schemas/
      memory.schema.json
      proposal.schema.json
      policy.schema.json
    policies/
      policies.json
  episodes/
    archive/
    index.json
    sources.json
  inbox/
    pending/
    approved/
    rejected/
  dist/
    AGENTS.md
    CLAUDE.md
    cursor-rule.mdc
    antigravity-agents.md
    GEMINI.md
    SKILLS.md
    policy.json
  logs/
    compile.jsonl
    sync.jsonl
    proposals.jsonl
    approvals.jsonl
    episodes.jsonl
```

## Save an approved memory yourself

```bash
agent-kernel remember "Never add local SQLite fallback to production Supabase apps." --type policy --level critical --tags supabase,database --publish
```

## Let an agent propose a rule

From Claude, Codex, Cursor, or another agent, ask it to run:

```bash
agent-kernel propose \
  --from claude \
  --type rule \
  --scope global \
  --level standard \
  --targets all \
  --text "Always run pnpm typecheck before finalizing TypeScript changes." \
  --reason "The user explicitly asked to save this as a shared rule."
```

Then review and approve:

```bash
agent-kernel inbox
agent-kernel approve <proposal-id> --publish
```

## Browse memory

```bash
agent-kernel memory list
agent-kernel memory search supabase
agent-kernel memory show no-sqlite-fallback-supabase
```
## Episodic memory

Rules answer "what standards must agents follow?". Episodes answer "what happened before, what did we try, and why did we decide that?".

```bash
agent-kernel episode add --title "Supabase auth decision" --tags supabase,auth --text "We decided not to add a local SQLite fallback because the app is production Supabase-backed."
agent-kernel episode sync --agent claude --limit 50
agent-kernel episode search "SQLite fallback Supabase"
agent-kernel episode show <episode-id>
agent-kernel episode stats
```

`episode sync` scans local Claude and Codex JSONL transcript folders when they exist, skips conversations containing this marker, and stores compact local JSON episodes:

```txt
<INSTRUCTIONS-TO-EPISODIC-MEMORY>DO NOT INDEX THIS CHAT</INSTRUCTIONS-TO-EPISODIC-MEMORY>
```

This is intentionally local and text-scored in `v0.0.5`. Vector search can be added later without changing the stored episode JSON shape.


## Validate memory and policies

```bash
agent-kernel validate
```

This checks memory shape, duplicate IDs, supported types, supported scopes, missing text, likely secrets, and policy pack arrays

## Migrate older v0.0.1 homes

```bash
agent-kernel migrate json --publish
```

If the old flat files exist, Agent Kernel imports them into the new JSON-first folders:

```txt
source/rules.json       -> source/memories/rules.json
source/memories.json    -> source/memories/workflows.json
source/skills.json      -> source/memories/skills.json
source/policies.json    -> source/policies/policies.json
```

## Strict enforcement

Rules inside markdown files are guidance. Agent Kernel turns selected rules into enforcement through:

1. Claude Code `PreToolUse` hooks
2. Claude Code `PostToolUse` scanners
3. Git `pre-commit` hooks
4. `agent-kernel guard`
5. optional CI templates in `examples/`

Install local enforcement:

```bash
agent-kernel enforce install
agent-kernel git-hook install .
```

Run guard manually:

```bash
agent-kernel guard
agent-kernel guard --staged
agent-kernel guard --file src/index.ts
```

## Start agents through the kernel

```bash
agent-kernel start claude .
agent-kernel start codex .
agent-kernel start cursor .
agent-kernel start antigravity .
agent-kernel start gemini .
```

This links the project first, then launches the selected CLI if installed

## Core commands

```txt
agent-kernel init [--sync] [--enforce]
agent-kernel doctor
agent-kernel compile
agent-kernel sync
agent-kernel link [project] [--hooks]
agent-kernel remember "text" [--type rule] [--level critical] [--publish]
agent-kernel propose --from claude --text "text" --reason "reason"
agent-kernel inbox
agent-kernel approve <id> [--publish]
agent-kernel reject <id>
agent-kernel publish
agent-kernel validate
agent-kernel migrate json [--publish]
agent-kernel memory list|search|show
agent-kernel episode add|sync|search|show|stats|reindex
agent-kernel enforce install
agent-kernel guard [--staged|--file path]
agent-kernel git-hook install [project]
agent-kernel start <claude|codex|cursor|antigravity|gemini> [project]
agent-kernel status
```

## Safety model

Agents may propose memories. Only Agent Kernel publishes memories

Generated markdown files are not treated as the only defense. Critical rules should also be backed by hooks, scanners, git hooks, or CI checks

## Design note

Agent Kernel does not vendor code from Memorix, Ruler, Aperion Shield, or other open-source projects. It uses the same broad architectural pattern: local memory, cross-agent rule distribution, and policy enforcement. This keeps the package license-clean and easy to inspect


## Development Backlog

The long-term roadmap is stored under `/develpment/` using the exact directory name requested by the project owner. It includes human-readable Markdown files and a machine-readable `backlog.json` for agents and automation.

