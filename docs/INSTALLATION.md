# Installation

> **Pick the lane that matches what you actually need.** Three lanes, one repo.
> Each lane is fully reversible and idempotent.

| Lane | You want | What gets installed | Time |
|---|---|---|---|
| **Lane 1** | Just the `dt` CLI | npm package → `dt` on PATH | 30s |
| **Lane 2** | `/mavis-ship` in Claude Code | Lane 1 + the `mavis-ship` skill + `mavis-orchestrate` CLI | 2m |
| **Lane 3** | Full local agent OS | Lane 2 + MMAS + agent-kernel + companion frameworks | 5–10m |

Don't know which lane? Read the [README](./README.md) first. The rest of this
doc is the technical reference.

---

## Lane 1 — `dt` CLI only

```bash
# Install
npm install -g delegate-team

# Verify
dt --version         # → 2.5.1
dt doctor            # backend health check (advisory only)

# Use
dt run "<task>"      # dispatch with auto backend selection
dt run "<task>" -b minimax-coder   # force a specific backend

# Uninstall
npm uninstall -g delegate-team
```

**What you get**: a single Node CLI. No skills, no hooks, no companion
frameworks, no network calls at runtime.

**What you do NOT get**: `/mavis-ship`, MMAS, agent-kernel, orchestrator routing.
Those are Lane 2 / Lane 3.

---

## Lane 2 — `/mavis-ship` in Claude Code

```bash
# 1. Install the dt CLI first (Lane 1)
npm install -g delegate-team

# 2. Install the orchestrator skill
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --orchestrator

# 3. Restart Claude Code so the slash command is registered.
# 4. Verify
mavis-orchestrate "what is a closure in JS"    # prints routing decision
/mavis-ship "your task here"                    # in any Claude Code session

# Uninstall
./install.sh --uninstall
```

**What you get**: the `mavis-ship` skill + `mavis-orchestrate` CLI on your
PATH + a `/mavis-ship` slash command registered in `~/.claude/commands/`.

**What you do NOT get**: MMAS, agent-kernel memory layer, companion frameworks.
Use Lane 3 for those.

---

## Lane 3 — full local agent OS

```bash
# 1. Install the dt CLI first (Lane 1)
npm install -g delegate-team

# 2. Clone + install everything
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team

# 2a. Dry-run first — see what would change on disk
./install.sh --all --dry-run

# 2b. Trust mode: pick strict / normal / dev
./install.sh --all --trust-mode normal --yes

# 3. Verify
./install.sh --verify

# 4. Uninstall
./install.sh --uninstall
```

**What you get**:

- `dt` CLI (Lane 1)
- `/mavis-ship` orchestrator (Lane 2)
- MMAS multi-agent framework → `~/.mavis/agents/mavis/multi-agent/`
- agent-kernel memory + governance → `~/.agent-kernel/`
- Companion frameworks (superpowers, Waza, unslop-preflight, autoresearch)
  installed where their own installers put them

**Safety notes**:

- `--dry-run` is non-destructive. Always run it first on a shared machine.
- `--no-network` skips `npx skills add` and `git clone` of companion frameworks.
- `--trust-mode strict` blocks auto-loading of MCP, blocks external downloads,
  and prints every sensitive operation before executing it.
- See [docs/SECURITY-MODEL.md](./SECURITY-MODEL.md) for the threat model.

---

## Installation matrix

| Component | Lane 1 | Lane 2 | Lane 3 |
|---|---|---|---|
| `dt` CLI | ✅ | ✅ | ✅ |
| `mavis-ship` skill + slash command | — | ✅ | ✅ |
| `mavis-orchestrate` CLI | — | ✅ | ✅ |
| MMAS (multi-agent team) | — | — | ✅ |
| agent-kernel (memory + governance) | — | — | ✅ |
| superpowers | — | — | ✅ (manual install) |
| Waza | — | — | ✅ (npx) |
| unslop-preflight | — | — | ✅ (npx / npm) |
| autoresearch | — | — | ✅ (manual install) |

---

## Verifying what is installed

```bash
# Lane 1
dt --version && dt doctor

# Lane 2 + 3
./install.sh --verify
```

The `--verify` step is non-destructive and idempotent. It prints a one-line
status for each component.

---

## Network and write surface

The installer touches these locations on a normal Lane 3 install:

- `~/.mavis/` — skills, agents, MMAS task state
- `~/.claude/` — slash command symlink, skill symlinks
- `~/.agent-kernel/` — memory home (kernel-managed)
- `~/.local/bin/` and `~/bin/` — CLI symlinks
- `~/.config/dt/` — runtime config

Network calls:

- Lane 2 — none
- Lane 3 — yes (npx skills add for Waza, optional `git clone` for unslop
  if `unslop` is not already on PATH, optional `agent-kernel init --sync` if
  you let the post-install hook run)

Pass `--no-network` to disable all of those.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `dt: command not found` | npm bin dir not on PATH | `npm bin -g` and add to PATH |
| `/mavis-ship` not found in Claude Code | slash command symlink missing | re-run `./install.sh --orchestrator` and restart Claude Code |
| `mavis-orchestrate: command not found` | `~/.local/bin` not on PATH | `export PATH="$HOME/.local/bin:$PATH"` |
| `agent-kernel: command not found` | kernel install skipped | `./install.sh --kernel` |
| Permission denied on `~/.local/bin` | bindir mode | use `mkdir -p ~/.local/bin && chmod 700 ~/.local/bin` |

---

## What this doc does not cover

- The orchestrator routing algorithm — see [docs/ROUTING.md](./ROUTING.md).
- The agent-kernel memory layer — see [docs/AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md).
- MMAS multi-agent runtime — see [docs/MMAS.md](./MMAS.md).
- Security policy — see [docs/SECURITY-MODEL.md](./SECURITY-MODEL.md).