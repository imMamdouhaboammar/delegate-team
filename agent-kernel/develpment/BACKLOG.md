# Agent Kernel Backlog to v2.0

## Product North Star

Agent Kernel is a local-first governance kernel for agentic coding.

It gives coding agents:

1. shared JSON memory
2. approved rules
3. project-aware context
4. MCP access
5. strict enforcement
6. audit trail
7. reusable skills
8. cross-agent consistency

The target for `v2.0` is simple: any coding agent working on the user's machine should operate under the same approved rules, and critical rules should be enforceable outside prompt context.

## Product Lines

### 1. Memory Core

Responsible for JSON memories, proposals, approval, search, validation, and migration.

### 2. Agent Adapters

Responsible for Claude, Codex, Cursor, Antigravity, Gemini, and future agent outputs.

### 3. Enforcement

Responsible for hooks, command guards, file guards, dependency guards, git hooks, CI gates, Semgrep, OPA, and policy packs.

### 4. Governance

Responsible for audit, sharing, teams, plugins, approvals, policy lifecycle, and reports.

## Version Roadmap

| Version | Stage | Goal |
| --- | --- | --- |
| `v0.1` | Core Stabilization | Make the CLI and JSON memory layout reliable |
| `v0.2` | Memory Governance | Add strong approval flow and memory pollution controls |
| `v0.3` | MCP Hardening | Make the MCP server production-ready |
| `v0.4` | Agent Adapters | Improve Claude, Codex, Cursor, Antigravity, and Gemini support |
| `v0.5` | Enforcement Engine | Convert rules into executable policies |
| `v0.6` | Git and CI Gates | Add pre-commit, pre-push, and CI guards |
| `v0.7` | Project Intelligence | Detect project type and load only relevant rules |
| `v0.8` | Skills Registry | Add local skill packs and triggers |
| `v0.9` | Security Hardening | Add safe logging, redaction, trust model, and sandbox options |
| `v1.0` | Stable Local Release | Make the system dependable for daily use |
| `v1.1` | TUI Dashboard | Add terminal UI for review and operations |
| `v1.2` | Observability | Add logs, reports, traces, and audit export |
| `v1.3` | Policy Packs | Add ready packs by project type |
| `v1.4` | Plugin SDK | Add extension points for adapters and guards |
| `v1.5` | Team Sharing | Add team rules and export/import |
| `v1.6` | Remote Sync | Add optional Git-backed sync |
| `v1.7` | Advanced Enforcement | Add Semgrep, OPA, and Conftest integrations |
| `v1.8` | Self-Healing Rules | Detect rule smells and suggest fixes |
| `v1.9` | Compatibility Suite | Test against fixtures and agent adapters |
| `v2.0` | Agent Governance OS | Full local governance kernel |

## v0.1 - Core Stabilization

### P0

- Stabilize the repository structure
- Separate CLI command routing from core logic
- Improve error handling and exit codes
- Add test fixtures
- Add `agent-kernel version`
- Add deeper `agent-kernel doctor --verbose`
- Add `agent-kernel config show`
- Add `agent-kernel config set`
- Prevent unsafe commands before `init`
- Improve package metadata and README

### New Commands

```bash
agent-kernel version
agent-kernel doctor --verbose
agent-kernel config show
agent-kernel config set <key> <value>
agent-kernel reset --local-only
```

### Acceptance Criteria

- `agent-kernel init` works from any directory
- `agent-kernel doctor` detects broken symlinks
- every command returns a meaningful exit code
- errors are actionable and not stack-trace-first

## v0.2 - Memory Governance

### P0

- Full JSON Schema validation
- Proposal scoring
- Duplicate detection
- Conflict detection
- Memory status lifecycle
- Approval audit log
- Reject reasons
- `memory edit`
- `memory deprecate`

### Lifecycle

```txt
draft
pending
approved
published
deprecated
rejected
archived
```

### New Commands

```bash
agent-kernel memory edit <id>
agent-kernel memory deprecate <id>
agent-kernel memory conflicts
agent-kernel memory duplicates
agent-kernel inbox review
agent-kernel approve <id> --publish
agent-kernel reject <id> --reason "Too broad"
```

### Acceptance Criteria

- every proposal must pass schema validation
- every critical global rule must require manual approval
- duplicate rules are detected before publish
- conflicts appear in `doctor`

## v0.3 - MCP Hardening

### P0

- MCP protocol compliance pass
- concise tool descriptions
- request validation
- allowlist for sensitive tools
- read-only mode by default
- approval tool disabled by default
- resource pagination
- MCP health check

### Tools

```txt
agent_kernel_get_status
agent_kernel_search_memory
agent_kernel_get_memory
agent_kernel_propose_memory
agent_kernel_list_pending
agent_kernel_guard_command
agent_kernel_get_project_profile
agent_kernel_get_relevant_rules
```

### P1

- Streamable HTTP MCP mode
- stdio mode hardening
- optional auth token for HTTP mode
- MCP tool description linting

### Acceptance Criteria

- MCP server can start and stop cleanly
- MCP clients can list tools
- memory proposal works through MCP
- approval is blocked unless explicitly enabled
- invalid MCP requests return safe structured errors

## v0.4 - Agent Adapters

### Claude Adapter

- `~/.claude/CLAUDE.md`
- `~/.claude/settings.json` hooks
- MCP install helper
- slash command docs
- `UserPromptSubmit` memory trigger
- `PreToolUse` guard
- `PostToolUse` scan

### Codex Adapter

- `~/.codex/AGENTS.md`
- project `AGENTS.md`
- nested `AGENTS.md` detection
- Codex wrapper
- worktree start mode

### Cursor Adapter

- `.cursor/rules/00-agent-kernel.mdc`
- generated project rules
- MCP config helper
- Cursor-specific instruction compiler
- optional `.cursorignore` suggestions

### Antigravity Adapter

- `.agents/agents.md`
- `.agents/skills` symlinks
- `GEMINI.md` compatibility
- workflows export

### Acceptance Criteria

- `agent-kernel connect claude` installs Claude integration
- `agent-kernel connect codex` links global and project `AGENTS.md`
- `agent-kernel connect cursor` generates Cursor project rules
- `agent-kernel connect antigravity` creates `.agents`
- `doctor` reports status for every adapter

## v0.5 - Enforcement Engine

### P0

- Policy compiler
- Command guard
- File write guard
- Dependency guard
- Secret guard
- Post-edit scanner
- Violation log
- Fix suggestions

### Policy Types

```txt
command_policy
file_policy
dependency_policy
secret_policy
architecture_policy
test_policy
response_policy
```

### Acceptance Criteria

- `agent-kernel guard --command "npm install"` rejects in a pnpm repo
- `agent-kernel guard --files` detects secrets
- `agent-kernel guard --staged` detects forbidden dependencies
- all violations are written to `logs/violations.jsonl`

## v0.6 - Git and CI Gates

### P0

- Install git pre-commit hook
- Install optional pre-push hook
- Generate `lefthook.yml`
- Generate `.pre-commit-config.yaml`
- Add `agent-kernel guard --staged`
- Add bypass detection report

### P1

- GitHub Actions workflow
- GitLab CI template
- Vercel build guard
- Netlify build guard

### Acceptance Criteria

- commit is blocked if a secret is detected
- commit is blocked if a critical policy is broken
- CI fails if `agent-kernel guard --ci` returns violations

## v0.7 - Project Intelligence

### P0

- Detect package manager
- Detect framework
- Detect database
- Detect build/test/lint commands
- Detect deployment target
- Create project profile
- Cache project profile
- Update profile when `package.json` changes

### Project Profile Example

```json
{
  "project_id": "teolaa",
  "path": "/Users/mamdouh/Projects/Teolaa",
  "package_manager": "pnpm",
  "framework": "nextjs",
  "database": "supabase",
  "commands": {
    "dev": "pnpm dev",
    "typecheck": "pnpm typecheck",
    "test": "pnpm test"
  }
}
```

### Acceptance Criteria

- `agent-kernel profile detect .` works
- `agent-kernel profile show` shows the cached profile
- generated agent context only includes relevant rules
- generic rules do not flood project files

## v0.8 - Skills Registry

### P0

- Local skills folder
- `SKILL.md` schema
- skill metadata JSON
- skill triggers
- skill search
- skill install
- skill export
- skill lint

### New Commands

```bash
agent-kernel skill create typescript-cli
agent-kernel skill list
agent-kernel skill search supabase
agent-kernel skill link .
agent-kernel skill pack ./skills/typescript-cli
```

### Skill Structure

```txt
skills/
  typescript-cli/
    skill.json
    SKILL.md
    scripts/
    references/
    examples/
```

### Acceptance Criteria

- skills appear in generated Claude/Codex/Cursor/Antigravity outputs
- skill triggers do not bloat `AGENTS.md`
- `doctor` detects missing skill metadata

## v0.9 - Security Hardening

### P0

- Secret redaction
- Path privacy
- Safe logs
- No raw environment dumps
- MCP allowlist
- Shell command sanitizer
- Symlink safety checks
- Repo trust model

### Trust Levels

```txt
trusted_user_home
trusted_project
untrusted_repo
untrusted_mcp_client
```

### P1

- Sandbox mode
- Worktree mode
- Read-only MCP mode
- Secure backup

### Acceptance Criteria

- logs do not store secrets
- MCP cannot approve rules unless explicitly enabled
- untrusted repos cannot modify user-level hooks
- `doctor` warns about risky symlinks

## v1.0 - Stable Local Release

### Scope

- Stable CLI
- Stable JSON memory layout
- Stable MCP server
- Stable Claude hooks
- Stable Codex, Cursor, Antigravity adapters
- Stable pre-commit guard
- Complete docs
- Install script
- Upgrade command
- Backup and restore

### Stable Commands

```bash
agent-kernel init
agent-kernel connect <agent>
agent-kernel link .
agent-kernel remember
agent-kernel propose
agent-kernel inbox
agent-kernel approve
agent-kernel reject
agent-kernel publish
agent-kernel sync
agent-kernel validate
agent-kernel guard
agent-kernel doctor
agent-kernel mcp serve
agent-kernel backup
agent-kernel restore
agent-kernel upgrade
```

### Definition of Done

- install from zip or npm link
- works on macOS without complex setup
- does not require build step to run
- does not write secrets to logs
- every command has tests
- every generated file has checksum metadata
- README has a clear quick start

## v1.1 - TUI Dashboard

### Features

- Inbox review screen
- Memory browser
- Rule conflicts screen
- Adapter status screen
- Guard violations screen
- Project profile screen
- Skill registry screen

### Commands

```bash
agent-kernel ui
agent-kernel dashboard
```

### Acceptance Criteria

- user can review proposal from terminal UI
- user can approve or reject from UI
- UI shows affected agents before publish

## v1.2 - Observability and Audit

### P0

- Session logs
- Tool call logs
- Memory proposal logs
- Policy violation logs
- Sync logs
- Report command
- Audit export

### Commands

```bash
agent-kernel logs
agent-kernel report weekly
agent-kernel audit .
agent-kernel audit export --format json
```

### Reports

- most violated rules
- agents with most violations
- projects needing policies
- proposals created this week
- rejected memories and reasons

## v1.3 - Policy Packs

### Built-in Packs

```txt
typescript-cli
nextjs-saas
supabase-app
chrome-extension
python-cli
marketing-saas
agentic-coding
security-baseline
```

### Commands

```bash
agent-kernel pack list
agent-kernel pack enable supabase-app
agent-kernel pack disable python-cli
agent-kernel pack inspect security-baseline
```

### Acceptance Criteria

- every pack has rules, policies, and skills
- every pack has test fixtures
- `doctor` recommends relevant packs for a project

## v1.4 - Plugin SDK

### Interfaces

```ts
interface AgentAdapter {}
interface MemoryProvider {}
interface PolicyProvider {}
interface Guard {}
interface CompilerTarget {}
interface SkillProvider {}
interface Reporter {}
```

### Commands

```bash
agent-kernel plugin create
agent-kernel plugin list
agent-kernel plugin enable
agent-kernel plugin disable
```

### Acceptance Criteria

- plugin can add a new adapter
- plugin can add a policy scanner
- plugin cannot write outside allowed plugin paths

## v1.5 - Team Sharing

### Structure

```txt
personal/
  memories/
team/
  rules/
  skills/
  policies/
project/
  profile.json
```

### Commands

```bash
agent-kernel team init
agent-kernel team export
agent-kernel team import
agent-kernel team diff
agent-kernel team publish
```

### Acceptance Criteria

- personal memories do not enter team export by default
- team rules have owner and version
- conflicts appear before import

## v1.6 - Remote Sync

### P0

- Git-backed sync
- Encrypted private bundle
- Machine-specific config ignored
- Conflict resolution
- Pull before publish
- Push after approve

### Commands

```bash
agent-kernel remote init git@github.com:you/agent-kernel-memory.git
agent-kernel pull
agent-kernel push
agent-kernel sync --remote
```

### Acceptance Criteria

- personal logs are not uploaded by default
- local paths are not uploaded unless user approves
- conflicts are shown clearly

## v1.7 - Advanced Enforcement Integrations

### P0

- Generate Semgrep rules
- Run Semgrep if installed
- Generate OPA/Rego policies
- Run Conftest if installed
- Normalize policy results
- Map violation severity

### Commands

```bash
agent-kernel enforce semgrep init
agent-kernel enforce opa init
agent-kernel guard --semgrep
agent-kernel guard --opa
```

### Acceptance Criteria

- system suggests install if external scanner is missing
- external scanner output maps to the same violation format
- CI can use `agent-kernel guard --ci`

## v1.8 - Self-Healing Rules

### Features

- Detect broad rules
- Detect conflicting rules
- Detect stale rules
- Detect unused rules
- Suggest scoped replacements
- Suggest policy conversion

### Commands

```bash
agent-kernel rules lint
agent-kernel rules smells
agent-kernel rules suggest-fixes
agent-kernel rules compact
```

### Rule Smells

```txt
context_bloat
conflicting_instruction
skill_leakage
lint_leakage
overbroad_rule
unenforceable_critical_rule
```

## v1.9 - Compatibility Suite

### P0

- Fixture projects
- Adapter snapshots
- Generated file snapshots
- Hook simulation tests
- MCP simulation tests
- Guard fixtures
- Upgrade tests
- Migration tests

### Fixture Projects

```txt
fixtures/nextjs-supabase
fixtures/typescript-cli
fixtures/python-cli
fixtures/chrome-extension
fixtures/monorepo
fixtures/no-package-json
```

### Commands

```bash
agent-kernel test adapters
agent-kernel test hooks
agent-kernel test mcp
agent-kernel test policies
```

### Acceptance Criteria

- every adapter has snapshot tests
- every migration from `v0.0.x` to latest is covered
- every policy has positive and negative tests

## v2.0 - Agent Governance OS

### Core Features

- Local-first memory kernel
- JSON-first source of truth
- Stable MCP server
- Stable agent adapters
- Stable policy compiler
- Stable Git and CI gates
- Stable skills registry
- Stable team sharing
- Stable plugin SDK
- Stable audit and reporting

### v2.0 Commands

```bash
agent-kernel init
agent-kernel connect
agent-kernel link
agent-kernel start
agent-kernel remember
agent-kernel propose
agent-kernel inbox
agent-kernel publish
agent-kernel sync
agent-kernel guard
agent-kernel enforce
agent-kernel skill
agent-kernel pack
agent-kernel team
agent-kernel plugin
agent-kernel report
agent-kernel doctor
agent-kernel ui
```

### v2.0 Acceptance Criteria

- fresh install in under 2 minutes
- works without internet after install
- works with Claude, Codex, Cursor, Antigravity, and Gemini
- critical rules are enforceable outside prompt context
- MCP tools are read-only by default
- no secret leakage in logs
- generated agent files are compact
- every memory has schema validation
- every critical policy has at least one blocking enforcement layer
- every adapter has tests
- every migration has tests
