---
name: skill-scaffold
description: |
  Scaffold a new Mavis skill with proper frontmatter, section structure, and optional companion
  artifacts (PreToolUse hook, slash command, bash test stub). Use when creating a new skill,
  bootstrapping a capability for the Mavis agent arsenal, or standardizing an existing skill's
  structure. Triggers on: "create a new skill", "scaffold a skill", "add a Mavis skill",
  "standardize this skill", "skill-scaffold", "mavis-skill-scaffold". Backed by the
  `mavis-skill-scaffold` bash script at `~/.mavis/bin/mavis-skill-scaffold`. Do NOT use for
  editing existing skills (use `skill-refiner`) or for creating agents (use `create-agent`).
---

# Skill Scaffold

> **Capability skill** — wraps the `mavis-skill-scaffold` CLI. Generates a properly-structured
> Mavis skill directory in one shot: frontmatter, sections, optional companion hook/command/tests.

## What this skill IS

1. **A scaffolding tool** — turns "I need a skill for X" into a working `SKILL.md` in <5 seconds.
2. **A structure enforcer** — every generated skill has the right frontmatter, ≥3 sections,
   valid kebab-case name, and trigger-rich description.
3. **A discoverability multiplier** — every scaffolded skill can be `--list`ed, `--validate`d,
   and routed to from `team-architect` / `expert-engineer`.

## What this skill is NOT

- Not a content generator — scaffolds structure only. The human (or model) fills in the substance.
- Not a skill refiner — use `skill-refiner` for editing existing skills.
- Not an agent scaffolder — use `create-agent` for new Mavis agents.
- Not a memory tool — doesn't write to `MEMORY.md` or `user.md`. Use `self-improve` for that.

---

## The CLI

```bash
mavis-skill-scaffold [OPTIONS]
```

Location: `~/.mavis/bin/mavis-skill-scaffold` (on PATH). Source: 16KB bash script with
`set -euo pipefail`, color-aware output, and full argument validation.

### Quick reference

| Flag | Purpose |
|---|---|
| `--name <kebab-name>` | Required. Skill name (kebab-case). |
| `--description "<triggers>"` | Required. Must include trigger keywords ("Use when...", triggers on 'X'). |
| `--type <type>` | `capability` (default) \| `bundle` \| `atomic`. |
| `--with-hooks` | Scaffold companion PreToolUse hook at `~/.claude/hooks/<name>-mindset.js`. |
| `--with-tests` | Scaffold bash test stub at `~/.mavis/skills/<name>/test-<name>.sh`. |
| `--with-command` | Scaffold `/<name>` slash command at `~/.claude/commands/<name>.md`. |
| `--update` | Preserve existing content; only fill gaps. |
| `--dry-run` | Preview without writing. |
| `--list` | List all skills in `--skills-root`. |
| `--validate <name>` | Check existing skill against best practices. |
| `--skills-root <path>` | Override default (`$HOME/.mavis/skills`). |
| `-h \| --help` | Show full usage. |

### Skill types (drives section template)

| Type | When to pick | Sections generated |
|---|---|---|
| `capability` (default) | Workflow-oriented, single domain | What IS / What IS NOT / Workflow / Examples / Cross-refs |
| `bundle` | Orchestrates other skills | Routing table / Architecture / Workflow / Component skills registry |
| `atomic` | Single focused technique | What IS / What IS NOT / Methodology / Examples / Cross-refs |

---

## Workflow — how I use this skill

1. **Receive request** — user says "make a skill for X" or "scaffold me a skill for Y".
2. **Pick type** — capability (default) | bundle | atomic based on scope.
3. **Draft description** — must include "Use when..." + trigger keywords. Aim for 100+ chars.
4. **Dry-run first** — `mavis-skill-scaffold --name X --description "..." --dry-run` to preview.
5. **Generate** — drop `--dry-run`. Confirm files created.
6. **Fill substance** — edit `SKILL.md` to replace `...` placeholders with real content.
7. **Validate** — `mavis-skill-scaffold --validate X` to confirm structure passes.
8. **Wire companions** — if `--with-hooks` was used, edit `~/.claude/settings.json` PreToolUse.
9. **Test** — if `--with-tests` was used, add real assertions and run the script.

---

## Examples

### Example 1: Atomic skill (single-purpose)

**Input**: "اعمل skill للـ rate limiting في الـ APIs"

**Behavior**:
```bash
mavis-skill-scaffold --name api-rate-limiter \
  --description "Rate limiting for APIs. Use when implementing request throttling, token bucket,
or leaky bucket algorithms in HTTP handlers. Triggers on 'rate limit', 'throttle', 'API quota'." \
  --type atomic --with-tests
```

**Output**:
- `~/.mavis/skills/api-rate-limiter/SKILL.md` — atomic-type template with Methodology section
- `~/.mavis/skills/api-rate-limiter/test-api-rate-limiter.sh` — bash test stub

Then edit `SKILL.md` to document token bucket algorithm, leaky bucket variants, Redis vs in-memory storage.

### Example 2: Capability skill (default)

**Input**: "عايز skill للـ security audit"

**Behavior**:
```bash
mavis-skill-scaffold --name security-audit \
  --description "Security audit workflow for authentication, authorization, and input handling code.
Use when reviewing auth flows, adding new endpoints, or hardening existing routes. Triggers on
'security audit', 'auth review', 'penetration test'." \
  --type capability --with-tests
```

**Output**: capability-type template with Workflow section (audit steps) + test stub.

### Example 3: Bundle skill with hook + slash command

**Input**: "اعمل bundle skill للـ API design كامل"

**Behavior**:
```bash
mavis-skill-scaffold --name api-design-master \
  --description "Full API design workflow covering REST, GraphQL, and gRPC. Use when designing
new APIs or refactoring existing ones. Triggers on 'API design', 'REST API', 'GraphQL schema'." \
  --type bundle --with-hooks --with-command
```

**Output**:
- `~/.mavis/skills/api-design-master/SKILL.md` — bundle-type template with routing table
- `~/.claude/hooks/api-design-master-mindset.js` — PreToolUse reminder hook
- `~/.claude/commands/api-design-master.md` — `/api-design-master` slash command

Then wire the hook into `~/.claude/settings.json` PreToolUse matcher `Edit|Write|MultiEdit`.

### Example 4: Validate existing skill

**Input**: "اعمل validate للـ expert-engineer"

**Behavior**:
```bash
# For agent-specific skills
mavis-skill-scaffold --validate expert-engineer \
  --skills-root /Users/mamdouhaboammar/.mavis/agents/mavis/skills

# For global Mavis skills (default location)
mavis-skill-scaffold --validate team-architect
```

**Output**: Checks frontmatter exists, `name:` matches directory, `description:` present (50+ chars),
≥3 `##` sections, trigger keywords detected.

### Example 5: List all skills

**Input**: "ورّيني كل الـ skills الموجودة"

**Behavior**:
```bash
mavis-skill-scaffold --list
```

**Output**: Table of all skill names + first line of description.

---

## Validation rules (what `--validate` checks)

| Check | Severity |
|---|---|
| Frontmatter starts with `---` | Error |
| `name:` matches directory name | Error |
| `description:` field present | Error |
| `description:` length ≥ 50 chars | Warning |
| ≥ 3 `##` sections | Warning |
| Trigger keywords detected ("use when", "trigger on", etc.) | Warning |

If any error → exit 1. If only warnings → exit 0 with warnings printed.

---

## Design rationale (Karpathy principles applied)

1. **Think Before Coding**: Tool exists because we kept re-writing the same SKILL.md frontmatter
   for `team-architect`, `quality-guard`, `self-improve`, and `expert-engineer`. Repeated work
   = automation opportunity.
2. **Simplicity First**: Pure bash. No Python venv, no npm deps, no MCP server. 16KB single file,
   `set -euo pipefail`, color-aware, exits cleanly on every error path.
3. **Surgical Changes**: Tool doesn't touch existing skills. Doesn't write to MEMORY.md, doesn't
   modify GLOBAL.md, doesn't spawn agents. Just creates one new directory.
4. **Goal-Driven Execution**: Success = generated SKILL.md passes `--validate`. The "fill the
   placeholders" step is human/model work, not the tool's job.

---

## Cross-references

- **Companion CLI**: `~/.mavis/bin/mavis-skill-scaffold` (this file's backing script)
- **Harness floor**: `~/.mavis/agents/mavis/harness/GLOBAL.md` §3 Workflow + §6 Security Arsenal
- **Accumulated lessons**: `~/.mavis/agents/mavis/memory/MEMORY.md`
- **Sibling skills**:
  - `skill-creator` — higher-level skill authoring workflow (meta-skill for skill design)
  - `skill-refiner` — for editing/improving existing skills
  - `self-improve` — for capturing lessons learned into the right memory layer
  - `create-agent` — for creating new Mavis agents (parallel to this for skills)
- **Existing Mavis skills** at `~/.mavis/skills/` (35 skills as of 2026-06-30):
  - `team-architect`, `quality-guard`, `self-improve` — the three Mavis-native capability skills
  - `mcp-*` (5 skills) — MCP server capability adapters
  - 25+ other skills covering review, refactor, debug, UI/UX, scraping, video, etc.

---

**Last updated**: 2026-06-30 — created by Mamdouh + Mavis after building the vertex-coder inspiration.
**Maintained by**: Mamdouh + Mavis (collaboratively).
