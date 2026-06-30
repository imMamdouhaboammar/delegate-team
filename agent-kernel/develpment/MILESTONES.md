# Milestones

## v0.1 - Core Stabilization

Goal: make the current CLI stable.

Must ship:

- better command structure
- `version`
- `doctor --verbose`
- config commands
- reliable error handling
- smoke test improvements

## v0.2 - Memory Governance

Goal: make memory safe to accept from agents.

Must ship:

- strict JSON Schema validation
- duplicate detection
- conflict detection baseline
- edit/deprecate lifecycle
- reject reasons
- approval audit trail

## v0.3 - MCP Hardening

Goal: make MCP safe and predictable.

Must ship:

- read-only default
- validated tool inputs
- resource pagination
- tool allowlist
- approval disabled unless explicitly enabled

## v0.4 - Agent Adapters

Goal: make every supported coding agent receive the right output.

Must ship:

- Claude adapter repair
- Codex adapter repair
- Cursor adapter repair
- Antigravity adapter repair
- Gemini adapter repair
- adapter health report

## v0.5 - Enforcement Engine

Goal: convert approved rules into executable policies.

Must ship:

- command policy
- file policy
- dependency policy
- secret policy
- violation format
- fix suggestions

## v0.6 - Git and CI Gates

Goal: prevent bypass outside agent context.

Must ship:

- pre-commit hook
- pre-push hook optional
- GitHub Actions workflow
- `guard --staged`
- `guard --ci`

## v0.7 - Project Intelligence

Goal: reduce context bloat by loading relevant rules only.

Must ship:

- profile detect
- profile cache
- package manager detection
- framework detection
- database detection
- command detection

## v0.8 - Skills Registry

Goal: move workflows from long rules into reusable skills.

Must ship:

- skill schema
- skill create/list/search/link
- skill triggers
- skill lint

## v0.9 - Security Hardening

Goal: make local use safer.

Must ship:

- safe logs
- redaction
- trust model
- symlink checks
- untrusted repo mode
- MCP allowlist hardening

## v1.0 - Stable Local Release

Goal: daily-use ready.

Must ship:

- stable CLI
- stable JSON memory
- stable MCP
- stable hooks
- stable adapters
- backup/restore
- install docs
- migration docs

## v1.1 - TUI Dashboard

Goal: terminal UI for review and operations.

Must ship:

- inbox screen
- memory browser
- violation screen
- adapter status screen

## v1.2 - Observability

Goal: make behavior inspectable.

Must ship:

- logs command
- report command
- weekly report
- audit export

## v1.3 - Policy Packs

Goal: ready rules by project type.

Must ship:

- built-in packs
- enable/disable
- inspect
- pack tests

## v1.4 - Plugin SDK

Goal: make the kernel extensible.

Must ship:

- adapter plugin interface
- guard plugin interface
- compiler target interface
- plugin enable/disable

## v1.5 - Team Sharing

Goal: separate personal and team rules.

Must ship:

- team init
- team export/import
- team diff
- rule owner/version

## v1.6 - Remote Sync

Goal: optional private sync across machines.

Must ship:

- Git remote init
- pull/push
- conflict resolution
- private path exclusions

## v1.7 - Advanced Enforcement

Goal: integrate mature scanners.

Must ship:

- Semgrep generation
- OPA/Rego generation
- Conftest integration
- normalized results

## v1.8 - Self-Healing Rules

Goal: improve rule quality.

Must ship:

- rule smells
- stale rule detection
- unused rule detection
- compact command

## v1.9 - Compatibility Suite

Goal: verify all adapters and policies.

Must ship:

- fixture projects
- adapter snapshots
- hook simulation
- MCP simulation
- migration tests

## v2.0 - Agent Governance OS

Goal: complete local governance kernel.

Must ship:

- local-first memory kernel
- stable MCP
- stable adapters
- stable enforcement
- stable skills
- stable audit
- stable team sharing
- stable plugin SDK
