# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot,
Codex, OpenCode, Gemini, etc.) when working with code in this repository.

## Repository Overview

`delegate-team` is the **agentic engineering supersystem** — a single GitHub
repo that bundles six top-level components and four companion frameworks behind
one entry command (`/mavis-ship "<task>"`). It's structured for SKILLS.sh and
Claude Code plugin marketplace discovery.

## Repository Structure

```
delegate-team/
├── SKILL.md                # Main skill manifest (this is the discoverable skill)
├── README.md               # User-facing overview
├── INSTALL.md              # Install guide
├── CHANGELOG.md            # Release notes
├── DT.md                   # dt-CLI gateway specifics
├── install.sh              # Single-command bootstrap, idempotent
├── package.json            # dt CLI TypeScript build config
├── tsconfig.json
├── tsup.config.ts
│
├── orchestrator/           # /mavis-ship skill + orchestrate.sh CLI
│   ├── SKILL.md            # discoverable as a sub-skill
│   ├── scripts/orchestrate.sh
│   └── README.md
│
├── scaffolder/             # mavis-skill-scaffold CLI
│   ├── SKILL.md
│   ├── bin/mavis-skill-scaffold
│   └── README.md
│
├── mmas/                   # Multi-agent team framework
│   ├── SKILL.md
│   ├── spawn-team.py
│   ├── watchdog.sh
│   ├── hash-edit.py
│   ├── agents/             # 8 YAML agent defs
│   └── README.md
│
├── god-agent/              # Backend #1 (Codex + opencode)
├── minimax-coder/          # Backend #2 (MiniMax via mmx)
├── vertex-coder/           # Backend #3 (Gemini)
│
├── integrations/           # 4 companion frameworks, one page each
│   ├── README.md
│   ├── superpowers.md
│   ├── waza.md
│   ├── unslop-preflight.md
│   └── autoresearch.md
│
├── src/                    # dt CLI TypeScript source
├── tests/                  # dt tests
├── dist/                   # dt build output
├── delegate-team/          # legacy sub-package from v1
├── metagpt/                # MetaGPT-style team runtime (experimental)
├── resources/              # competitive-analysis + system-design assets
├── workspace/              # scratch + storage for agents
│
├── .claude-plugin/
│   ├── plugin.json         # single-plugin manifest (Claude Code marketplace)
│   └── marketplace.json    # multi-plugin manifest (Waza-style multi-plugin install)
│
└── skills.sh.json          # skills.sh leaderboard groupings + featured
```

## Skills in this repo (discoverable by Skills.sh)

`npx skills add imMamdouhaboammar/delegate-team -a claude-code -g -y` discovers:

| Skill name | Path | Triggers |
|---|---|---|
| `delegate-team` | `./SKILL.md` | "full arsenal", "use everything", "everything intelligently" |
| `mavis-ship` | `./orchestrator/SKILL.md` | "/mavis-ship", orchestrator-related routing queries |
| `skill-scaffold` | `./scaffolder/SKILL.md` | "create a new skill", "scaffold mavis skill" |
| `mmas` | `./mmas/SKILL.md` | "spawn team", "multi-agent", "boss mode" |
| `dt` | covered by main `delegate-team` | "delegate task", "use Codex", "use MiniMax" |
| `god-agent` | `./god-agent/SKILL.md` | "run with god agent", "codex" |
| `minimax-coder` | `./minimax-coder/SKILL.md` | "run with MiniMax", "MiniMax M3" |
| `vertex-coder` | `./vertex-coder/SKILL.md` | "run with Gemini" |

## Creating a new component

1. **Decide which top-level dir it belongs in.** If it's a new role type (UI
   designer, code reviewer, security auditor), extend `mmas/agents/`. If it's a
   new backend, add a sibling to `god-agent/` / `minimax-coder/`. If it's a new
   cross-cutting tool (scaffold, format, lint), make a new top-level dir.
2. **Add `SKILL.md`** at the new component's root with proper frontmatter
   (`name` + `description` required; `allowed-tools` recommended).
3. **Update `README.md`** at the component level and add a line to the top
   README's component table.
4. **Update the marketplace** in `.claude-plugin/marketplace.json` if the new
   component should be installable as a separate plugin.
5. **Update `skills.sh.json`** to feature the new skill in a grouping.

## Naming conventions

- **Top-level components**: lowercase, kebab-case (`mmas/`, `god-agent/`)
- **Skill directories**: kebab-case, identical to the `name` field in `SKILL.md`
- **`SKILL.md` filenames**: always uppercase, always this exact filename
- **Scripts**: `kebab-case.sh` or `kebab-case.py` for top-level helpers
- **YAML agent defs in `mmas/agents/`**: `<role>.yaml`

## SKILL.md format

Required frontmatter (YAML):

```yaml
---
name: kebab-case-name
description: |
  What this skill does and when to use it. Include all-natural-language trigger
  queries — agents use this to decide whether to load the skill.
---
```

Optional fields:

```yaml
allowed-tools: [Bash, Read, Write, Edit, Grep, Glob, TodoWrite]
metadata:
  internal: true   # hide from normal discovery
```

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Major** (3.0.0): breaking changes to public surfaces — `dt run` API, SKILL.md
  frontmatter, orchestrator routing
- **Minor** (2.1.0): new component or new sub-skill (e.g. adds `mmas` to v2)
- **Patch** (2.0.1): bugfix, doc update

Bump in `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
+ `CHANGELOG.md`. Tag the release with `git tag -a vX.Y.Z`.

## License

MIT — see [`LICENSE`](./LICENSE).

## See also

- `CLAUDE.md` — Claude-Code-specific guidance
- `install.sh --help` — installer entry points
- https://skills.sh — registry where this repo gets indexed
