# agent-kernel in delegate-team — memory layer usage guide

> **TL;DR**: agent-kernel is delegate-team's shared long-term memory.
> Save rules once → every agent in every project uses them. Save episodes → recall
> "what did we do last time" across sessions. Searchable. Approved via inbox.

This guide shows how each delegate-team component uses agent-kernel as its memory
backbone. The vendored CLI ships at `agent-kernel/dist/cli.mjs`. The wrapper
`agent-kernel/wrapper.sh` resolves the right binary automatically.

---

## 1. /apeiron chain uses kernel for cross-session memory

When you run `apeiron "<task>"` and the verdict is BUILD/PUBLISH or
FEATURE or BUG, the chain now writes an **episode** at the end so the next time
you ask a similar question, the kernel can recall it.

```bash
# After /apeiron finishes
apeiron-save "<task>" "<verdict>" "<what happened>"
# which under the hood runs:
agent-kernel episode add \
    --title "/apeiron: <task>" \
    --tags apeiron,<verdict> \
    --text "<what happened>"
```

Future `/apeiron` invocations automatically prepend `agent-kernel memory search`
matches and `agent-kernel episode search` hits to the plan.

---

## 2. mm/multi-agent team uses kernel for shared rules

When `spawn-team.py` spins up the 8 agents (Atlas, Forge, Scout, Oracle, Librarian,
Reviewer, Visionary, Sentinel), they all read the same `~/.agent-kernel/source/memories/*.json`.
No need to repeat "use TypeScript strict mode" or "always run npm run lint" per agent.

If an agent wants to add a new rule, it **proposes** to the inbox:

```bash
agent-kernel propose \
    --from forge \
    --type rule \
    --scope global \
    --level standard \
    --targets all \
    --text "Always pin Python deps in requirements.txt" \
    --reason "Atlas asked me to propose this"
```

You review in the morning:

```bash
agent-kernel inbox              # List pending
agent-kernel approve <id> --publish
```

Once published, every agent in every project sees it on the next compile.

---

## 3. dt CLI delegates to kernel for memory across backend runs

The `dt run "<task>"` CLI invokes Codex / MiniMax / Gemini / MetaGPT. Before
delegating, it pulls relevant memories:

```bash
# dt internally runs:
agent-kernel memory search "<task keywords>" | head -10
```

The backend agent sees those rules in its system context. After the run, dt
captures the outcome as an episode.

---

## 4. apeiron-skill-scaffold proposes new-skill memories

When you scaffold a new skill, the scaffolder proposes a memory so the next agent
knows the skill exists:

```bash
apeiron-skill-scaffold --name my-new-skill --propose
# → scaffolds the SKILL.md + then runs:
#   agent-kernel propose --from scaffolder --type skill --text "my-new-skill does X"
```

---

## 5. Capture-the-flag: search before you ask

Before asking any agent to do work, search kernel memory first:

```bash
agent-kernel memory search "stripe webhooks"
agent-kernel episode search "stripe webhook bug"
```

Often the answer is already there.

---

## 6. Safety: agent-kernel guard before commit

The kernel ships a `guard` scanner that catches dangerous commands and leaked
secrets in staged files:

```bash
agent-kernel guard           # Scan whole working tree
agent-kernel guard --staged   # Only staged files (faster, pre-commit-style)
agent-kernel guard --file src/index.ts
```

delegate-team's install script wires `agent-kernel git-hook install .` so every
`git commit` runs the guard automatically.

---

## Where the memory lives

```
~/.agent-kernel/
  config.json                       # User's settings (level, targets, etc.)
  source/
    memories/
      rules.json                    # Always-follow rules
      preferences.json              # Style preferences (e.g. "prefer tabs over spaces")
      workflows.json                # How-to steps ("to deploy, run X")
      project-notes.json            # Per-project facts
      skills.json                   # Available skills
    schemas/                        # JSON Schema for validation
    policies/policies.json          # Policy pack arrays
  episodes/
    archive/                        # Past session snapshots (compact JSON)
    index.json                      # Searchable index
    sources.json                    # Where episodes were captured from
  inbox/
    pending/                        # Agent proposals waiting for approval
    approved/                       # Approved (about to publish)
    rejected/                       # Rejected (kept for audit)
  dist/
    AGENTS.md                       # Compiled instruction files (one per target)
    CLAUDE.md
    cursor-rule.mdc
    antigravity-agents.md
    GEMINI.md
    SKILLS.md
    policy.json
  logs/
    compile.jsonl                   # Every compile event
    sync.jsonl                      # Every sync event
    proposals.jsonl                 # Every proposal
    approvals.jsonl                 # Every approve/reject
    episodes.jsonl                  # Every episode add/sync
```

All paths are configurable via `AGENT_KERNEL_HOME` env var.

---

## Commands cheat-sheet

```bash
# Setup
agent-kernel init --sync --enforce      # First time in a project
agent-kernel link . --hooks             # Wire AGENTS.md + git hook
agent-kernel doctor                     # Health check

# Memory
agent-kernel remember "text" --type rule --level critical --publish
agent-kernel memory list
agent-kernel memory search "keyword"
agent-kernel memory show <rule-id>

# Episodes (cross-session recall)
agent-kernel episode add --title "..." --tags ... --text "..."
agent-kernel episode sync --agent claude --limit 50
agent-kernel episode search "keyword"
agent-kernel episode show <id>
agent-kernel episode stats
agent-kernel episode reindex

# Rule proposals (agent-initiated)
agent-kernel propose --from <agent> --type rule --text "..." --reason "..."
agent-kernel inbox
agent-kernel approve <id> --publish
agent-kernel reject <id>

# Compile + distribute
agent-kernel compile                    # Regenerate AGENTS.md + CLAUDE.md + ...
agent-kernel sync                       # Push to all linked projects
agent-kernel validate                   # JSON shape + secrets + duplicate-ID check

# Enforcement
agent-kernel enforce install            # Install Claude hooks
agent-kernel git-hook install .         # Install pre-commit hook
agent-kernel guard [--staged|--file]   # Scan for dangerous patterns / leaks

# Agents
agent-kernel start claude .             # Launch a CLI through the kernel
agent-kernel start codex .
agent-kernel start cursor .
agent-kernel start antigravity .
agent-kernel start gemini .

# Migration
agent-kernel migrate json --publish     # v0.0.1 → v0.0.5 layout
```

---

## Compatibility matrix with delegate-team components

| Component | Uses kernel for | How |
|---|---|---|
| `orchestrator/` | Save chain outcome as episode | `agent-kernel episode add` at end of run |
| `mmas/` | Shared rules + agent proposals | Reads `~/.agent-kernel/source/memories/*.json` |
| `scaffolder/` | Register new skill as memory | `agent-kernel propose --type skill` |
| `dt` CLI | Pull context before backend call | `agent-kernel memory search` |
| `god-agent/` | Same as dt | Same |
| `minimax-coder/` | Same as dt | Same |
| `vertex-coder/` | Same as dt | Same |
| `integrations/` | Reference doc only | Each integration doc links to kernel MEMORY.md |

---

## License

MIT — kernel vendored from
[@mamdouh/agent-kernel v0.0.5](https://github.com/imMamdouhaboammar/agent-kernel).
Original © Mamdouh Aboammar.