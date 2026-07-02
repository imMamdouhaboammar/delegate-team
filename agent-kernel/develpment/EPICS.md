# Backlog by Epic

## Epic 1: JSON Memory System

### P0

- schema validation
- memory IDs
- proposal lifecycle
- approved memory storage
- proposal storage
- audit logs

### P1

- duplicate detection
- conflict detection
- memory tags
- memory search
- memory edit and deprecate

### P2

- semantic search optional
- stale memory detection
- memory compaction

## Epic 2: Agent Adapter Compiler

### P0

- `AGENTS.md` compiler
- `CLAUDE.md` compiler
- Cursor `.mdc` compiler
- Antigravity `.agents` compiler
- `GEMINI.md` compiler

### P1

- OpenCode compiler
- Windsurf compiler
- adapter status reporting
- adapter repair command

### P2

- custom adapter plugins
- adapter snapshot tests

## Epic 3: MCP Server

### P0

- stdio MCP server
- read-only tools
- `propose_memory` tool
- memory search tool
- pending inbox tool
- guard command tool

### P1

- HTTP mode
- optional auth token
- resource pagination
- MCP client inspector helper

### P2

- tool usage audit
- per-client allowlist

## Epic 4: Enforcement

### P0

- command guard
- file guard
- secret scan
- dependency guard
- violation logs

### P1

- Semgrep integration
- OPA/Conftest integration
- GitHub Actions template
- pre-commit integration

### P2

- sandbox mode
- worktree mode
- policy auto-fix suggestions

## Epic 5: Project Awareness

### P0

- package manager detection
- framework detection
- command detection
- package dependency scan

### P1

- database detection
- deployment detection
- monorepo detection
- profile cache

### P2

- project health score
- rule relevance scoring

## Epic 6: Skills and Packs

### P0

- local skill schema
- local skill registry
- skill listing
- skill linking

### P1

- skill triggers
- policy packs
- pack enable/disable
- pack doctor checks

### P2

- skill marketplace import
- signed skill packs

## Epic 7: Governance

### P0

- approval inbox
- approve/reject commands
- audit logs
- proposal sources

### P1

- team export/import
- remote sync
- rule ownership
- rule versioning

### P2

- role-based approval
- multi-user review

## Epic 8: Security

### P0

- redaction
- safe logs
- MCP allowlist
- untrusted repo mode

### P1

- encrypted backup
- signed policy packs
- symlink safety
- local path privacy

### P2

- supply-chain checks
- reproducible release checks
