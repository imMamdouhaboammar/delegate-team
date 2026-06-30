# INSTALL

One-command install for the entire `delegate-team` supersystem.

## Quickstart (recommended)

```bash
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all
```

This installs:

- **`dt` CLI** (the gateway, built via npm)
- **`/mavis-ship` orchestrator** + `mavis-orchestrate` CLI
- **`mavis-skill-scaffold`** CLI
- **MMAS** multi-agent framework
- **Waza** (auto via `npx`)
- **unslop-preflight** (auto via npm)

After install, verify everything:

```bash
./install.sh --verify
```

## Selective install

```bash
./install.sh --dt             # Just the dt CLI
./install.sh --orchestrator   # Just the /mavis-ship skill
./install.sh --scaffolder     # Just the skill scaffolder
./install.sh --mmas           # Just the multi-agent framework
./install.sh --integrations   # Just the companion frameworks
./install.sh --all            # Everything (default if no flag)
```

## Manual install for parts `install.sh` can't automate

Two companion frameworks require manual steps because their install paths
aren't non-interactive scriptable:

- **superpowers**: see [`integrations/superpowers.md`](./integrations/superpowers.md)
- **autoresearch**: see [`integrations/autoresearch.md`](./integrations/autoresearch.md)

`install.sh --integrations` will print a reminder.

## Uninstall

```bash
./install.sh --uninstall
```

This removes everything `install.sh` added. Note: companion frameworks installed
via their own installers (Waza, unslop, superpowers, autoresearch) need to be
uninstalled separately using their respective `uninstall` commands.

## Verification matrix

| Check | Path / Command |
|---|---|
| dt CLI gateway | `which dt` |
| Orchestrator skill | `~/.mavis/skills/mavis-ship/SKILL.md` exists |
| Slash command | `~/.claude/commands/mavis-ship.md` exists (symlink) |
| Skill scaffolder | `which mavis-skill-scaffold` |
| MMAS framework | `~/.mavis/agents/mavis/multi-agent/spawn-team.py` exists |
| Waza skills | `~/.claude/skills/{think,check,hunt,...}/SKILL.md` |
| unslop CLI | `which unslop` |
| superpowers hook | `~/.claude/hooks/superpowers/run-hook.cmd` exists |
| autoresearch | `~/.claude/commands/autoresearch*.md` exists |

Run `./install.sh --verify` to check all at once.

## Quick start after install

In a Claude Code session:

```bash
/mavis-ship "Make API p95 < 200ms"
```

Or from any shell:

```bash
mavis-orchestrate "Build a CLI to convert CSV to JSON"
```

Or for the multi-agent team (Atlas autonomous mode):

```bash
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas
```

Or just use `dt`:

```bash
dt run "Refactor the user model for multi-tenancy"
```
