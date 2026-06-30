# CHANGELOG

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.4.0] — 2026-06-30

### Documentation — Polished README badge bar

Replaced the 8-badge hero with a structured 23-badge layout in 5 sections:

- **📦 Install** — npm version · bundlephobia install size · weekly downloads
- **🧬 Status** — GitHub release · release date · license · last commit ·
  commits-since-latest-release
- **🛡️ Quality** — CI badge for `ci.yml` · `npm-publish.yml` · `release.yml`
- **🌐 Ecosystem** — Skills.sh · stars · issues · PRs · contributors ·
  code size · top language
- **⚙️ Stack** — Node 18+ · TypeScript 5.6+ · Python 3.10+ · Bash 4+ · MIT

All 26 tested badge URLs return 200. Color-coded by section. All dynamic
(values update without re-releasing).

## [2.3.0] — 2026-06-30

### Added — npm package + auto-publish workflow

The npm package is now live. Users can install the `dt` CLI in one command:

```bash
npm install -g delegate-team
# or
npx delegate-team --help
```

#### GitHub ↔ npm mismatch resolved

- **npm versions live**: 2.0.0, 2.1.0, 2.1.1, 2.2.0 — all published with
  consistent `package.json` (the cleaned-up slim one introduced in this release).
  dist-tag `latest` → 2.2.0.
- **Previous mismatch**: the original `package.json`'s `files` whitelist included
  `vertex-coder/`, which transitively pulled in `vertex-coder/.venv` (163 MB of
  Python packages) into the npm tarball → 42.3 MB / 7,160 files. After cleanup,
  tarball is 21.6 KB / 6 files.

#### What changed in package.json

- **`files` field** slimmed to: `["dist", "README.md", "LICENSE"]` (was: 9 entries
  including `delegate-team/`, `vertex-coder/`, etc.)
- **`description`** rewritten to reflect the supersystem (was: dt-CLI-specific)
- **`engines.node`** `>=18` declared (was: undeclared)
- **`publishConfig`** added: `access: public`, `tag: latest`
  (no `provenance: true` — it requires OIDC which only GH Actions has; the
  publish workflow sets `--provenance` explicitly via flag)
- **`keywords`** expanded from 8 → 28 (mavis-ship, agentic-engineering,
  superpowers, waza, unslop, etc.)
- **`bin`** unchanged (`dt` + `delegate-team`)
- **`author`** upgraded from string → object with `name`, `email`, `url`
- **`repository.directory`** removed (single-package repo, not a workspace)

#### Auto-publish — `.github/workflows/npm-publish.yml`

New workflow that publishes to npm whenever a `v*` tag is pushed:

```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      dry-run: ...
```

Steps:
1. Checkout + setup Node 22 with `cache: npm`
2. `npm ci`
3. `npm run typecheck`
4. `npm run build` (tsup → dist/cli.js)
5. Validate pack dry-run (size sanity check)
6. `npm publish --access public --provenance` (CI has OIDC for provenance)
7. Verify via `npm view delegate-team version`
8. `npm dist-tag add delegate-team@vX.Y.Z latest`

Required secrets:
- `NPM_TOKEN` — npm automation token (classic, read-write)

Required permissions:
- `id-token: write` — for npm provenance signing

#### README updates

Added 2 new badges to the badge bar:
- `npm version` (red, npm logo, links to npmjs.com)
- `npm downloads` (red, monthly)
- `npm publish` (workflow status)

Plus a new install path (Path A — npm) added to the install section, alongside
the existing three.

## [2.2.0] — 2026-06-30

### Polished — README + CI expansion

This release is primarily a documentation and CI overhaul. No code changes to
the orchestrator or backends; the supersystem runtime is identical to v2.1.1.

#### README rewrite

- Full re-design: centered hero, badge bar, three installation paths (Skills.sh,
  Claude marketplace, bootstrap script), component breakdown with per-component
  language/status badges, ASCII architecture diagram, comparison table, usage
  examples with real output, acknowledgments, and roadmap
- 8 strategic shields.io badges at the top (version · license · stars · CI ·
  Skills.sh · Node · Python · Bash)
- Per-component flat badges showing language (TS / Bash / Python) and maturity
  (stable / beta / experimental)

#### CI expansion (`.github/workflows/ci.yml`)

Replaced the original 2-job workflow with a 5-job matrix that exercises the
entire supersystem:

- `build-and-test` — Node.js 18/20/22 matrix → typecheck + build + test
- `shell-checks` — bash -n + shellcheck on install.sh, orchestrate.sh,
  watchdog.sh, mavis-skill-scaffold
- `python-checks` — py_compile + YAML lint (mmas/agents) + JSON lint
  (package.json + manifests + skills.sh.json)
- `orchestrator-tests` — verifies root SKILL.md frontmatter discipline + the
  full 6-task orchestrate.sh routing matrix (BUILD/PUBLISH, UI, PERF,
  RESEARCH, BUG, TRIVIAL) on every PR
- `manifest-validate` — ensures Skills.sh + Claude marketplace compatibility
  stays green

This makes the CI badge in README meaningful — it now reflects actual code
quality, not just `npm test`.

## [2.1.1] — 2026-06-30

### Fixed — orchestrate.sh routing false-positives

## [2.1.0] — 2026-06-30

### Added — Skills.sh + Claude marketplace compatibility

## [2.0.0] — 2026-06-30

### Added — supersystem release

This release expands the repo from a single CLI (`dt`) into a **complete agentic
engineering supersystem**. The original `dt` gateway is preserved unchanged.

#### New components

- **`orchestrator/`** — `/mavis-ship` skill and `orchestrate.sh` CLI.
  The single-command orchestrator that runs the full chain
  (`/think` → `unslop audit` → `writing-plans` → `autoresearch` or `/delegate-team` or
  `/mavis-team` → `/check` → `quality-guard`).
  Symlinked to `~/.claude/skills/mavis-ship/` and `~/.claude/commands/mavis-ship.md` on install.

- **`scaffolder/`** — `mavis-skill-scaffold` CLI + skill manifest.
  Generates properly-structured Mavis skill directories in one shot.
  Source: 538-line bash script. Installed to `~/.mavis/bin/mavis-skill-scaffold`.

- **`mmas/`** — Multi-agent team framework. Eight specialized agents
  (Atlas, Forge, Scout, Oracle, Librarian, Reviewer, Visionary, Sentinel) +
  `spawn-team.py` orchestrator + `watchdog.sh` 30s polling loop +
  `hash-edit.py` LINE#HASH content-hash validated editor.
  Installed to `~/.mavis/agents/mavis/multi-agent/`.

- **`integrations/`** — Four companion frameworks with one-page install guides:
  - `superpowers.md` — obra/superpowers (242k⭐): 14 methodology skills + SessionStart hook
  - `waza.md` — tw93/Waza (6.1k⭐): 8 habits-engineering skills
  - `unslop-preflight.md` — 23 reasoning gates that block generic UI slop
  - `autoresearch.md` — Karpathy's metric-driven iteration loop

- **`install.sh`** — One-command bootstrap, idempotent, supports selective install.

#### Updated

- **`README.md`** — Top-level README rewritten as supersystem overview. Existing `dt` content
  moved to a section within, with full migration to `DT.md`.
- **`package.json`** + **`tsconfig.json`** — unchanged (the `dt` CLI binary).
- **`.gitignore`** — added Python + MMAS-runtime patterns.

### Compatibility

- The `dt` CLI gateway is **unchanged**. Existing users who only want `dt` are unaffected.
- All new components are additive.

### Upgrade from v1

```bash
git pull origin master
cd delegate-team
./install.sh --orchestrator --scaffolder --mmas --integrations
./install.sh --verify
```

## [1.0.0] — 2026-06-29

Initial public release of `dt` — local CLI gateway for AI coding agent delegation.

- Backend matrix: Codex, OpenCode, MiniMax, Gemini, MetaGPT-style team
- Failover ring across configured backends
- Lean Token Protocol for context-size-minimized routing
- Autopilot setup with venv + credential checks
- Skill linker for Claude Code + Gemini CLI
