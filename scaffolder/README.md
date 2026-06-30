# scaffolder/ — `mavis-skill-scaffold`

> One-shot generator for properly-structured Mavis skill directories.

## What this is

A CLI that creates Mavis-format skill folders with the right frontmatter, allowed-tools,
references, scripts, hooks, and tests. Saves you 30-60 minutes per skill.

## Install

Handled by parent `./install.sh`:

```bash
./install.sh --scaffolder
# or
./install.sh --all
```

The installer copies `bin/mavis-skill-scaffold` to `~/.mavis/bin/` (already on PATH).

## Usage

```bash
mavis-skill-scaffold --name my-skill \
                     --description "Trigger the skill when..." \
                     --type workflow \
                     --with-hooks \
                     --with-tests \
                     --with-command \
                     --dry-run
```

Flags:

| Flag | Effect |
|---|---|
| `--name <name>` | Skill name (kebab-case) |
| `--description <text>` | Description that goes in frontmatter |
| `--type <type>` | workflow / reference / utility / bundle |
| `--with-hooks` | Include example PreToolUse + PostToolUse hooks |
| `--with-tests` | Include example test file + runner |
| `--with-command` | Also create matching slash command at `~/.claude/commands/` |
| `--dry-run` | Print plan without writing |
| `--list` | List installed skills |
| `--validate <name>` | Validate an existing skill's structure |
| `--skills-root <path>` | Custom install location |

## What it generates

```
my-skill/
├── SKILL.md              ← Frontmatter + workflow + checklist
├── scripts/              ← Optional helper scripts
├── references/           ← Optional reference docs
└── tests/
    └── test-my-skill.sh  ← Validation script
```

## Files

- `SKILL.md` — Skill manifest for the scaffolder itself
- `bin/mavis-skill-scaffold` — Bash CLI (538 lines, zero dependencies beyond bash 4+)

After install, also reachable as `~/.mavis/bin/mavis-skill-scaffold`.
