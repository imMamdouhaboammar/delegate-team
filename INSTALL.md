# INSTALL — v2.7.0

One-command install for the entire `delegate-team` supersystem (with the full
v2.7.0 arsenal: `/mavis-ship` orchestrator, autopilot, mavis-ship-uni).

## Quickstart (recommended)

```bash
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all
```

This installs:

- **`dt` CLI** (the gateway, built via npm)
- **`/mavis-ship` orchestrator** + 47-case router (`orchestrate.py --selftest`)
- **`mavis-ship` standalone skill bundle** (NEW v2.7.0)
- **`autopilot.sh`** — 7-stage GOD command (NEW v2.7.0)
- **`mavis-ship-uni`** — smart universal wrapper (NEW v2.7.0)
- **`agents-health.sh`** — health check for 10 coding agents
- **`mavis-skill-scaffold`** CLI
- **MMAS** multi-agent framework
- **agent-kernel** memory + governance layer
- **Waza** (auto via `npx`)
- **unslop-preflight** (auto via npm)

After install, verify everything:

```bash
./install.sh --verify        # 13 components
agents-health.sh             # 10 coding agents
orchestrate.py --selftest    # 47/47 routing cases
```

## Selective install

```bash
./install.sh --dt             # Just the dt CLI
./install.sh --orchestrator   # Just the /mavis-ship skill (root + orchestrator/)
./install.sh --mavis-ship     # Just the standalone mavis-ship skill bundle (NEW v2.7.0)
./install.sh --scaffolder     # Just the skill scaffolder
./install.sh --mmas           # Just the multi-agent framework
./install.sh --kernel         # Just agent-kernel (memory + governance)
./install.sh --integrations   # Just the companion frameworks
./install.sh --all            # Everything (default if no flag)
```

## What v2.7.0 adds (the arsenal)

| Component | Path after install | What it does |
|---|---|---|
| `orchestrate.py` | `~/.mavis/skills/mavis-ship/scripts/orchestrate.py` | 47-case router, classifies task signature → picks the right chain |
| `catalog.py` | `~/.mavis/skills/mavis-ship/scripts/catalog.py` | 38 curated integrations + 1890 auto-discovered skills indexer |
| `autopilot.sh` | `~/delegate-team/bin/autopilot.sh` | The GOD command — runs the full 7-stage chain in fg or `--background` |
| `mavis-ship-uni` | `~/delegate-team/bin/mavis-ship-uni` | Smart universal wrapper — detects Mavis / codex / claude / gemini / opencode / mmx / shell, dispatches the right flow |
| `agents-health.sh` | `~/delegate-team/bin/agents-health.sh` | Health check for the 10 symlinks in `~/delegate-team/bin/` |

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

## Verification matrix (v2.7.0 — 13 components)

| Check | Path / Command |
|---|---|
| dt CLI gateway | `which dt` |
| Orchestrator skill (root) | `~/.mavis/skills/delegate-team/SKILL.md` exists |
| Orchestrator skill (mavis-ship) | `~/.mavis/skills/mavis-ship/SKILL.md` exists |
| Orchestrator scripts | `orchestrate.py --selftest` returns 47/47 |
| Catalog | `catalog.py` lists 38 integrations + 1890 skills |
| autopilot.sh | `autopilot.sh --help` works |
| mavis-ship-uni | `mavis-ship-uni --list-runtimes` works |
| agents-health.sh | `agents-health.sh` returns 10/10 ready |
| Slash command | `~/.claude/commands/mavis-ship.md` exists (symlink) |
| Skill scaffolder | `which mavis-skill-scaffold` |
| MMAS framework | `~/.mavis/agents/mavis/multi-agent/spawn-team.py` exists |
| agent-kernel | `~/.mavis/agents/mavis/kernel/` exists |
| Waza skills | `~/.claude/skills/{think,check,hunt,...}/SKILL.md` |
| unslop CLI | `which unslop` |
| superpowers hook | `~/.claude/hooks/superpowers/run-hook.cmd` exists |
| autoresearch | `~/.claude/commands/autoresearch*.md` exists |

Run `./install.sh --verify` to check all at once.

## Quick start after install (v2.7.0)

In a Mavis session (canonical):

```bash
mavis-ship "Make API p95 < 200ms"
```

In any agent session (codex / claude / gemini / opencode / mmx) — uses mavis-ship-uni:

```bash
mavis-ship-uni "Build a CLI to convert CSV to JSON"
# → autopilot --background (agent returns immediately + chain runs detached)
```

From any shell (foreground — you watch the log scroll):

```bash
mavis-ship-uni "Refactor the user model for multi-tenancy"
# → autopilot foreground
```

Get just the route + plan (no execution):

```bash
orchestrate.py --prewarm "<task>"
# → JSON manifest: verdict + dispatch + stages + auto-discovered skills
```

Dry-run the full chain (no execution, just stages):

```bash
autopilot.sh --dry-run "<task>"
# → walks all 7 stages with [dry-run] markers
```

For the multi-agent team (Atlas autonomous mode):

```bash
python3 ~/.mavis/agents/mavis/multi-agent/spawn-team.py --atlas
```

Or just use `dt`:

```bash
dt run "Refactor the user model for multi-tenancy"
```
