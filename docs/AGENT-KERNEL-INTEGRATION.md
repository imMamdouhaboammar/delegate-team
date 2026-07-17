# Agent-Kernel Integration

> **TL;DR**: agent-kernel is delegate-team's **companion** memory + governance
> layer. delegate-team can run perfectly without it. When agent-kernel is
> installed, the orchestrator gains a "memory stage" that searches past rules
> and episodes before each task, and writes new episodes after.

This document is the boundary contract. It does **not** document agent-kernel
itself — for that, read [`agent-kernel/SKILL.md`](./agent-kernel/SKILL.md) and
[`agent-kernel/MEMORY.md`](./agent-kernel/MEMORY.md) inside this repo.

---

## What agent-kernel does

Agent-kernel provides:

1. **Shared local memory** at `~/.agent-kernel/source/memories/*.json`
   — rules, preferences, workflows, project notes, skills.
2. **Episodic memory** at `~/.agent-kernel/episodes/` — searchable across
   sessions.
3. **Approval inbox** — agents propose new rules; the kernel publishes them
   only after human review.
4. **Generated instruction files** — `AGENTS.md`, `CLAUDE.md`,
   `.cursor/rules/00-agent-kernel.mdc`, `.agents/agents.md`, `GEMINI.md` —
   compiled from the same JSON source.
5. **Hooks** — Claude `PreToolUse` + `PostToolUse`, git `pre-commit`,
   optional CI guard.
6. **MCP tools** — `agent_kernel_search_episodes`, `agent_kernel_read_episode`,
   `agent_kernel_capture_episode`, `agent_kernel_sync_episodes`.
7. **Deterministic policy guard** — blocks `rm -rf`, `curl|sh`, force-push to
   `main` / `master`, secret leaks, and any rule you add.

## What delegate-team does

delegate-team is the **router and orchestrator**. It does:

- npm CLI `dt` for low-level dispatch.
- `/apeiron` skill that inspects the task, picks the right stage chain,
  and writes a structured trace.
- MMAS multi-agent runtime.
- Install paths for all of the above.

delegate-team does **not**:

- Store persistent memory of its own (it uses agent-kernel for that, when
  available).
- Publish rules to your tools (that's the kernel's job).
- Hook into your editor (also kernel's job).

The split is intentional: **delegate-team decides what to do; agent-kernel
remembers what was done.**

---

## How `/apeiron` uses agent-kernel

When you run `/apeiron "<task>"`, the orchestrator:

1. Scores the task against its 11 stage signals (see [ROUTING.md](./ROUTING.md)).
2. If `score_memory >= 2` (memory / recall / rule / agent-kernel keywords
   detected), **prepends** two stages to the chain:
   - `agent-kernel memory search` — looks up relevant rules in
     `~/.agent-kernel/source/memories/*.json`
   - `agent-kernel episode search` — searches `~/.agent-kernel/episodes/`
     for past sessions with similar tasks
3. After the chain finishes (or aborts), **appends** `agent-kernel episode add`
   to capture the outcome.

This means the orchestrator's behavior is **strictly additive** with
agent-kernel — it does not replace any other stage.

---

## What happens when agent-kernel is NOT installed

- The orchestrator's memory stage is silently skipped.
- The verdict is computed from the non-memory signals only.
- The user sees no warning by default (this is intentional — agent-kernel is
  optional).
- All other stages still work: `/think`, `unslop`, `writing-plans`,
  `/delegate-team`, `/check`, `quality-guard`.

**This is the default for Lane 1 and Lane 2 installs.** Lane 3 (`./install.sh
--all`) installs agent-kernel by default.

To get a clear warning that agent-kernel is missing, run:

```bash
apeiron --check-kernel "your task here"
```

The orchestrator will print the verdict **and** a soft warning if the
kernel CLI is not on `$PATH`.

---

## What happens when agent-kernel IS installed

- The memory stage runs before and after the chain.
- The orchestrator's trace JSON includes a `kernel_used: true` flag.
- Hooks installed by the kernel (Claude `PreToolUse` + git `pre-commit`)
  enforce policy decisions independently of the orchestrator.
- The `/apeiron` SKILL.md lists `agent-kernel` as an explicit step.

---

## How memory and policy checks affect routing

Routing is **not** blocked by agent-kernel policy guard — the orchestrator
prints a verdict and the SKILL.md drives execution. The kernel's policy guard
runs at the hook level (e.g. before `git commit`), not at the routing level.

If a hook blocks an action, the orchestrator sees the failure as a normal
tool error and the chain reports it via `quality-guard`. The verdict is not
re-run.

This is a deliberate separation:

- Orchestrator decides what the chain should do.
- Kernel decides what the user's tools are allowed to do.

---

## How to disable kernel integration

If you installed agent-kernel via `./install.sh --kernel` and want to disable
it for a session:

```bash
export AGENT_KERNEL_DISABLED=1
apeiron "<task>"
```

The orchestrator checks `AGENT_KERNEL_DISABLED` first and skips the memory
stage even if the binary is on `$PATH`.

To disable hooks without uninstalling:

```bash
agent-kernel unlink .   # removes AGENTS.md / CLAUDE.md symlinks and git hook
```

To uninstall entirely:

```bash
./install.sh --uninstall   # removes only what install.sh added
```

Your `~/.agent-kernel/` memories are preserved. To wipe them, run
`agent-kernel doctor` for cleanup instructions.

---

## How to verify kernel integration

```bash
# Is the CLI on PATH?
command -v agent-kernel && agent-kernel --version

# Does the memory home exist?
ls -la ~/.agent-kernel/

# Are hooks linked?
agent-kernel doctor

# Is the orchestrator using it?
apeiron --check-kernel "what did we do about auth last time?"
```

If `agent-kernel --version` returns `0.0.5` and the orchestrator prints
`kernel_used: true` in its trace, you are fully integrated.

---

## Boundary rules (read this before contributing)

1. **delegate-team never imports agent-kernel source.** The vendored CLI at
   `agent-kernel/dist/cli.mjs` is the only allowed integration surface.
2. **agent-kernel never imports delegate-team source.** It is a standalone
   Node CLI.
3. **Updating agent-kernel** = bumping `agent-kernel/VERSION`, replacing
   `agent-kernel/dist/cli.mjs`, regenerating `agent-kernel/SKILL.md` if the
   CLI surface changes. Update `agent-kernel/MEMORY.md` if the contract with
   `/apeiron` changes.
4. **The orchestrator must always work without agent-kernel.** If you change
   `orchestrate.sh` to assume kernel features, you have broken Lane 2
   installs. Test with `AGENT_KERNEL_DISABLED=1`.

---

## What this doc does NOT cover

- The agent-kernel CLI itself — see `agent-kernel/SKILL.md` and
  `agent-kernel/docs/`.
- The memory protocol — see `agent-kernel/docs/MEMORY_PROTOCOL.md`.
- The approval inbox flow — see `agent-kernel/docs/STRICT_MODE.md`.

Those docs are inside `agent-kernel/docs/` and are the canonical source for
agent-kernel's own behavior.