# Installation

> **Pick the lane that matches what you actually need.** Three lanes, one repo.
> Each lane is reversible and idempotent.

| Lane | You want | What gets installed | Time |
|---|---|---|---|
| **Lane 1** | Just the `dt` CLI | npm package → `dt` on PATH | 30s |
| **Lane 2** | `/mavis-ship` in Claude Code | Lane 1 + the `mavis-ship` skill + `mavis-orchestrate` CLI | 2m |
| **Lane 3** | Full local agent OS | Lane 2 + MMAS + agent-kernel + companion frameworks | 5–10m |

Don't know which lane? Read the [README](../README.md) first. The rest of this
doc is the technical reference.

---

## Runtime requirements

| Runtime | Required | Why |
|---|---|---|
| Node.js | `>=20` | `dt` CLI, tsup build, npm package scripts |
| npm | modern npm, npm `>=11.5.1` recommended for Trusted Publishing | publish workflow and provenance |
| Python | `>=3.10` | MMAS, backend agents, modern type syntax |
| Bash | `>=4` | orchestrator, installer, watchdog |

The CI matrix tests Node 20, 22, and 24. Python checks run on Python 3.11.

---

## Lane 1 — `dt` CLI only

```bash
# Install
npm install -g delegate-team

# Verify
dt --version
dt doctor            # human-readable backend health check
dt doctor --json     # machine-readable output for CI / scripts

# Use
dt run "<task>"                    # dispatch with auto backend selection
dt run "<task>" --dry-run          # show selected backend and fallback chain
dt run "<task>" -b minimax         # force a specific backend

# Uninstall
npm uninstall -g delegate-team
```

**What you get**: a single Node CLI. No skills, no hooks, no companion
frameworks, no network calls at runtime unless you explicitly dispatch to a
backend that uses network credentials.

**What you do NOT get**: `/mavis-ship`, MMAS, agent-kernel, or companion
framework installation. Those are Lane 2 / Lane 3.

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
dt route --last                                 # latest saved route trace

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

# 2. Clone + inspect everything before installing
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team

# 2a. Safest preview: no writes, no network
./install.sh --all --dry-run --no-network --trust-mode strict

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
- MMAS agents and watchdogs are launched in detached process groups so the kill
  switch can clean up subprocess trees, not only parent PIDs.
- See [docs/SECURITY-MODEL.md](./SECURITY-MODEL.md) for the threat model.

---

## Non-interactive `dt setup`

Use this path for CI, bootstrap scripts, or machines where prompts are not
acceptable:

```bash
dt setup \
  --project my-gcp-project \
  --location us-central1 \
  --skip-auth \
  --skip-gcp-enable \
  --skip-provision \
  --yes
```

Flags:

| Flag | Purpose |
|---|---|
| `--project <id>` | Set the GCP project without prompting. Required for reliable non-interactive setup. |
| `--location <region>` | Write the configured GCP location. Defaults to `us-central1`. |
| `--skip-auth` | Do not run `gcloud auth login` or ADC login. |
| `--skip-gcp-enable` | Do not enable Vertex AI / Dialogflow APIs automatically. |
| `--skip-provision` | Do not provision the Vertex AI agent. |
| `--yes` | Use safe default answers where prompts still exist. |

`dt setup` writes local config files with private permissions:

- `~/.config/dt/config.json` → `0600`
- `~/.metagpt/config2.yaml` → `0600`
- containing directories → `0700`

---

## Release and publish checks

Before bumping or publishing a version, run:

```bash
npm ci
npm run version:check
npm install --package-lock-only
npm run typecheck
npm test
npm publish --dry-run --access public
```

`npm run version:check` enforces version sync across:

- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- every marketplace plugin entry
- `CHANGELOG.md`

It intentionally prints a warning, not a hard failure, when `package-lock.json`
version metadata is stale. Regenerate it with:

```bash
npm install --package-lock-only
```

The npm publish workflow runs the same version guard, prints a GitHub Actions
warning for stale lockfiles, validates the tarball, smoke-tests the installed
package, blocks secret-like files, publishes with provenance, then verifies npm
registry state.

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

# Machine-readable health check
dt doctor --json

# Route planning without execution
dt run "test routing" --dry-run

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
- `~/.metagpt/` — MetaGPT adapter config when `dt setup` is used

Network calls:

- Lane 2 — none
- Lane 3 — yes (npx skills add for Waza, optional `git clone` for unslop
  if `unslop` is not already on PATH, optional `agent-kernel init --sync` if
  you let the post-install hook run)
- `dt setup` — Python package installs, optional gcloud auth, optional API
  enablement, optional provisioning

Pass `--no-network` to `install.sh` to disable installer network calls. Use
`dt setup --skip-auth --skip-gcp-enable --skip-provision` when you need setup
without cloud mutations.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `dt: command not found` | npm bin dir not on PATH | `npm bin -g` and add to PATH |
| `/mavis-ship` not found in Claude Code | slash command symlink missing | re-run `./install.sh --orchestrator` and restart Claude Code |
| `mavis-orchestrate: command not found` | `~/.local/bin` not on PATH | `export PATH="$HOME/.local/bin:$PATH"` |
| `agent-kernel: command not found` | kernel install skipped | `./install.sh --kernel` |
| Permission denied on `~/.local/bin` | bindir mode | use `mkdir -p ~/.local/bin && chmod 700 ~/.local/bin` |
| `dt setup --yes` aborts with no project | non-interactive setup needs a project | add `--project <id>` |
| `dt run` cannot find `relay.mjs` or `opencode-router.mjs` | broken npm artifact or old install | upgrade with `npm install -g delegate-team@latest` and run `dt run --dry-run "test"` |
| npm publish warning says lockfile drift | package version changed but lockfile was not regenerated | `npm install --package-lock-only` |

---

## What this doc does not cover

- The orchestrator routing algorithm — see [docs/ROUTING.md](./ROUTING.md).
- The agent-kernel memory layer — see [docs/AGENT-KERNEL-INTEGRATION.md](./AGENT-KERNEL-INTEGRATION.md).
- MMAS multi-agent runtime — see [docs/MMAS.md](./MMAS.md).
- Security policy — see [docs/SECURITY-MODEL.md](./SECURITY-MODEL.md).
