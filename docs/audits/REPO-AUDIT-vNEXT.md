# Repository Audit — delegate-team vNEXT

> **Auditor**: Apeiron (delegated by user)
> **Date**: 2026-06-30
> **Scope**: Pre-refactor baseline for the vNEXT series.
> **Working assumption**: the published release is **2.5.1** (CHANGELOG + package.json + manifests agree).
> **Goal**: enumerate drift, over-claims, and unclear boundaries before any code is touched.

This is a practical audit, not a research paper. It is written so the next
refactor patch can grep for it.

---

## 1. Versions — current canonical state

| Source | Version | Notes |
|---|---|---|
| `package.json` | **2.5.1** | Authoritative for the npm CLI. |
| `.claude-plugin/plugin.json` | 2.5.1 | Authoritative for the marketplace. |
| `.claude-plugin/marketplace.json` | 2.5.1 (×10 entries) | All sub-plugins pinned. |
| `CHANGELOG.md` latest entry | `[2.5.1] — 2026-06-30` | BundlePhobia Rspack fix. |
| `dt --version` (built CLI) | reads from package.json | Confirmed in CHANGELOG. |
| `agent-kernel/VERSION` | `0.0.5` | Vendored binary. |
| `orchestrator/scripts/orchestrate.sh` header | `v2.5.0` (memory stage) | One version behind, but the file itself was not bumped at 2.5.1 (no code change). |
| `ci.yml` comment | "v2.5.1 release notes" | Reference, not a version. |

### Mismatches found

| File | Stale line | What it says | What it should say |
|---|---|---|---|
| `README.md:58` | `dt --version      # → 2.4.0` | Hardcoded example output | `→ 2.5.1` (or remove the example) |
| `README.md:372` | `- [ ] **v2.5.0** — ATLAS web UI for non-CLI users` | Roadmap says v2.5.0 is **future** | The package is already at v2.5.1; mark v2.5.0 done + add v2.6.0 entry. |
| `README.md:304` | `v1 → v2 → v2.1 → v2.4 release notes` | CHANGELOG doc index | Should list v2.5 / v2.5.1 too. |
| `orchestrator/scripts/orchestrate.sh:13` | `v2.5.0 — added memory stage` | Comment header | Leave as-is (file was last logically changed at 2.5.0). Optionally annotate "unchanged at 2.5.1". |

The hardcoded `→ 2.4.0` in the install example is the single most damaging
stale string: it lies about what the user will see after running `dt --version`
on the published package.

---

## 2. Install paths currently documented

README documents **four** install paths under "Quick install":

1. **Path A — npm global** (just `dt` CLI). Releases auto-publish from `npm-publish.yml`.
2. **Path B — Skills.sh CLI** (`npx skills add … -a claude-code -g -y`). Installs 8 sub-skills.
3. **Path C — Claude Code marketplace** (`/plugin marketplace add …`).
4. **Path D — Bootstrap script** (`./install.sh --all | --orchestrator | --mmas | --integrations | --verify`).

`install.sh` itself supports the granular flag set:

```
--all | --dt | --orchestrator | --scaffolder | --mmas | --kernel
| --integrations | --verify | --uninstall
```

`install.sh` flags missing today (planned in this audit series):

- `--dry-run`, `--no-network`, `--trust-mode <strict|normal|dev>`, `--yes`

**Credibility issues**:

- The README's four install paths are not clearly differentiated by what they
  actually install. A user who picks Path A does **not** get the
  `/apeiron` skill, MMAS, or agent-kernel — the README does not say this.
- "Four routing layers" in the hero quote is unverified marketing and should
  be removed or clarified.

---

## 3. CLI commands currently exposed (`dt`)

From `src/cli.ts`:

| Command | Alias | Purpose |
|---|---|---|
| `dt check` | `status` | Scan backend health |
| `dt doctor` | — | Alias for `check` |
| `dt link-skill` | — | Symlink to `.agents/` and `.gemini/` |
| `dt setup` | `init` | Autopilot GCP + venv setup |
| `dt auth` | — | gcloud login |
| `dt gcp-enable <project>` | — | Enable Vertex AI APIs |
| `dt vertex-provision` | — | Provision Vertex agent on GCP |
| `dt vx <mode>` | `vertex` | Direct Vertex AI mode |
| `dt metagpt` | `mg` | MetaGPT multi-agent |
| `dt run` | `dispatch` | Backend dispatch with failover |
| `dt serve [port]` | `proxy` | LLM gateway proxy server |
| `dt route --explain "<task>"` | **MISSING** | Should expose routing trace |
| `dt --version` / `dt --help` | — | Standard |

**Missing today but specified in this audit series**:

- `dt route --explain "<task>"` (Phase 5) — should print the same JSON the
  orchestrator writes to `.logs/routing/*.json`.

---

## 4. Existing CI checks

`.github/workflows/`:

| Workflow | What it does |
|---|---|
| `ci.yml` | 5 jobs: build-and-test (Node 18/20/22), shell-checks (bash -n + shellcheck), python-checks (py_compile + YAML + JSON), orchestrator-tests (6-task routing matrix + frontmatter discipline), manifest-validate (Skills.sh + Claude marketplace compat) |
| `codeql.yml` | Static security scan |
| `npm-publish.yml` | Auto-publish to npm on `v*` tag push (OIDC provenance) |
| `release.yml` | Auto-create GitHub Release with categorized notes + tarball |

CI is healthy but does **not** currently verify:

- Installer safety modes (`--dry-run`, `--no-network`, `--trust-mode`).
- Routing-trace JSON output (Phase 5 will add this).
- MMAS guardrail config defaults (Phase 7 will add this).
- Version drift between README, CHANGELOG, package.json (Phase 2 will add this).

These are the gaps this audit series will close.

---

## 5. Security posture (from `SECURITY.md`)

The doc is structured around the **original `dt` CLI** (workspace sandboxing,
command allowlist, supply-chain guard, MCP auto-load opt-in, proxy hardening,
dynamic gcloud auth).

**Gaps**:

- `SECURITY.md` does not mention `install.sh` risk surface (writes to `~/.apeiron/`,
  `~/.claude/`, `~/.local/bin/`, downloads companion frameworks via `npx` + `git clone`).
- `SECURITY.md` does not mention the orchestrator (`/apeiron`) routing risk.
- `SECURITY.md` does not mention agent-kernel policy guard or the proposal inbox.
- `SECURITY.md` does not mention MMAS subprocess spawning risk.
- `SECURITY.md` does not mention MCP `DT_ENABLE_MCP` switch being honored at install time.

These are not "missing features" — they are **missing documentation**. The
governance actually exists, but a security reviewer reading the file alone
won't know.

---

## 6. agent-kernel integration today

**Layout**:

- Vendored as `agent-kernel/` (CLI at `agent-kernel/dist/cli.mjs`).
- Wrapped by `agent-kernel/wrapper.sh` which falls through: `$AGENT_KERNEL_BIN`
  → `agent-kernel` on PATH → vendored binary → `npx -y @mamdouh/agent-kernel`.
- Installed by `install.sh --kernel` (delegates to `agent-kernel/install.sh`).
- Orchestrator detects memory keywords and adds a memory stage to the chain.
- `agent-kernel/SKILL.md` + `agent-kernel/MEMORY.md` document the contract.

**Boundary issues**:

- The `agent-kernel/` subtree is **part of the repository** (not a sub-module).
  Updates to agent-kernel require a vendoring commit in delegate-team.
- The orchestrator's memory stage is **scored but never overrides verdict**.
  This is correct behavior but not documented in `orchestrate.sh` help text.
- There is no explicit "kernel-disabled mode" toggle. If the kernel is absent,
  the orchestrator silently skips the memory stage. This is acceptable but
  should be documented.
- There is no `--kernel` flag in `dt`. The CLI cannot currently demand
  kernel mode and fail loudly when it is absent.

---

## 7. Orchestrator routing behavior today

`orchestrator/scripts/orchestrate.sh` (332 lines):

- 10 score buckets: think, unslop, writing, systematic, autoresearch, delegate, mmas, check, qguard, research, memory.
- Verdict priority: RESEARCH > MEMORY > BUILD/PUBLISH > PERFORMANCE/METRIC > UI DELIVERY > MULTI-AGENT TEAM > BUG > FEATURE > default.
- BUILD/PUBLISH path triggers on `publish | release | ship | push | deploy | launch | package it | cut a release | build a repo | build a package | build a library | build an sdk | github | open-source | open source | opensource`.
- UI gate requires UI-first words (no `agentic` substring false-positives).
- MMAS requires `squad | swarm | crew | multi-agent | parallel agents | concurrent agents`.
- Memory stage detects `remember | recall | memory | episode | agent-kernel | ak`.

**What is not transparent**:

- The decision is printed as text but **not as a structured trace**.
- Users cannot answer "why did the orchestrator choose BUG over FEATURE?".
- There is no way to log routing decisions for post-hoc debugging.

This is the gap Phase 5 closes.

---

## 8. MMAS behavior today

`mmas/spawn-team.py` (776 lines):

- Atlas mode: spawns Atlas alone, polls for `team_plan.json` (120s default timeout), then spawns the chosen team.
- Manual mode: `--team atlas,forge,scout,oracle`.
- Watchdog: 30s default polling interval (`watchdog.sh`).
- Per-agent PIDs + log paths + summary paths tracked in `boulder.json`.

**Guardrails missing today**:

- **No max-agents cap.** A user can pass `--team atlas,atlas,atlas,atlas,atlas,atlas,atlas,atlas,atlas,atlas,atlas,atlas` and spawn 12 simultaneous subprocesses.
- **No per-agent timeout.** If an agent hangs, the watchdog eventually marks it stuck, but the subprocess keeps running and consuming tokens until killed manually.
- **No plan-only mode** — once the team starts, agents can write to `MMAS_TASKS_ROOT` and the cwd.
- **No kill switch** — the only kill command is `spawn-team.py stop <task_id>`, which is not discoverable from the README.
- **No summary report at end of run** — only per-agent `.summary` files.
- **Hardcoded path leak**: `DELEGATE_TEAM_ROOT = Path("${DELEGATE_TEAM_ROOT}")` at line 56 of `spawn-team.py` — this is **a portability bug** that must be fixed in Phase 7 or earlier.

---

## 9. Mismatches and credibility issues (consolidated)

### Hard claims that need correction or removal

- `dt --version # → 2.4.0` in README install example → **stale**.
- Roadmap `v2.5.0 — ATLAS web UI` listed as future → **stale**.
- "Four routing layers" in hero quote → **unverified**.
- "1800+ curated skills" in acknowledgments → **unverified**.
- `delegated-team-dev` repo (mentioned in `integrations/README.md` search?) → **not in this repo**.

### Architectural boundaries that need to be clearer

- `delegate-team` vs `agent-kernel` vs `mmas` vs `orchestrator` are sometimes
  conflated in the README and SECURITY.md. The user must be able to answer:
  *what does each component do?* without reading source.
- The README tries to explain both "use `dt`" and "run the full supersystem" in
  one file. A first-time user picking Path A (npm) will be confused by the
  MMAS / agent-kernel / orchestrator diagrams.

### Operational safety gaps

- `install.sh` has no `--dry-run`, `--no-network`, or `--trust-mode`. An
  enterprise user cannot audit what will be installed.
- The orchestrator prints text but no structured trace.
- MMAS can spawn unlimited agents with no per-agent timeout.

### Documentation that does not exist yet

The README references several docs that are listed in the index but not always
present, or that need to be created:

- `docs/INSTALLATION.md`
- `docs/ARCHITECTURE.md`
- `docs/WORKFLOWS.md`
- `docs/AGENT-KERNEL-INTEGRATION.md`
- `docs/MMAS.md`
- `docs/SECURITY-MODEL.md`
- `docs/ROUTING.md`

`INSTALL.md` exists at the repo root but its scope is unclear (Path D only?).
`SECURITY.md` exists but covers only `dt` CLI. `integrations/agent-kernel.md`
exists but is integration-scoped, not architected.

---

## 10. Recommendations (ranked)

1. **Fix version drift first.** A user looking at the install example and seeing
   `2.4.0` will distrust every other claim. Phase 2.
2. **Split the README into lanes.** Phase 3 unlocks every other doc phase.
3. **Add installer safety modes.** Phase 4 is the single biggest trust unlock.
4. **Add routing traces.** Phase 5 — small change, big debuggability win.
5. **Clarify agent-kernel boundary.** Phase 6 — the README conflates memory and routing.
6. **MMAS guardrails + portability fix.** Phase 7 — the hardcoded `/Users/...`
   path is a real bug, not just an audit finding.
7. **Tests for the safety surface.** Phase 9 prevents the new flags from regressing.
8. **README readability pass + roadmap update.** Phase 8 + Phase 10.

---

## 11. Out of scope for this audit

- Backend-specific changes (Codex / Gemini / MiniMax credentials).
- New product features.
- npm publishing changes.
- Skills.sh registry schema changes.

These are recorded for a future audit, not addressed here.

---

*End of audit.*