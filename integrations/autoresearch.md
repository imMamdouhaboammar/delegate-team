# autoresearch

**Role**: Metric-driven iteration loop. Improves metric X by Y% through repeated
"modify → verify → keep/discard" iterations.

- **Repo**: https://github.com/uditgoenka/autoresearch (v2.2.1)
- **Inspired by**: Karpathy's autoresearch pattern — "You don't need AGI. You need
  a goal, a metric, and a loop that never quits."
- **Commands**: 14 slash commands at `~/.claude/commands/autoresearch*.md`
- **Skill**: `~/.claude/skills/autoresearch/`
- **9 safety hooks** in `~/.claude/hooks/`

## Install (manual, non-interactive)

```bash
git clone --depth 1 https://github.com/uditgoenka/autoresearch /tmp/autoresearch-repo

# Copy commands
mkdir -p "$HOME/.claude/commands"
cp /tmp/autoresearch-repo/commands/*.md "$HOME/.claude/commands/"

# Copy skill + safety hooks (rewrites ${CLAUDE_PLUGIN_ROOT} → absolute)
cp -r /tmp/autoresearch-repo/skills/autoresearch "$HOME/.claude/skills/"
# … merge hooks via the install-autoresearch-hooks.py helper
```

## 14 subcommands

| Command | Use when |
|---|---|
| `/autoresearch` | Core loop. Plain-language goal → orchestrator picks pipeline. |
| `/autoresearch:plan` | Convert fuzzy goal → validated Goal/Scope/Metric/Verify config |
| `/autoresearch:debug` | Autonomous bug hunter with hypothesis iteration |
| `/autoresearch:fix` | Crush errors to zero (tests/types/lint/build) |
| `/autoresearch:security` | STRIDE + OWASP audit with red-team |
| `/autoresearch:ship` | 8-phase shipping workflow (PR / deploy / release) |
| `/autoresearch:scenario` | Generate edge cases across 12 dimensions |
| `/autoresearch:predict` | 5 expert personas debate before debugging |
| `/autoresearch:reason` | Adversarial refinement for subjective decisions |
| `/autoresearch:probe` | 8 personas interrogate requirements |
| `/autoresearch:improve` | Research ICP, generate PRDs for what to build next |
| `/autoresearch:learn` | Scout → generate docs → validate → fix |
| `/autoresearch:evals` | Analyze iteration results (trends, plateaus) |
| `/autoresearch:regression` | Stability gate — baseline vs candidate, STABLE/UNSTABLE |

## Example invocation

```bash
/autoresearch "Make the API respond faster than 200ms p95"

# Or with explicit Goal/Scope/Metric/Verify
/autoresearch
Goal: Increase test coverage from 72% to 90%
Scope: src/**/*.test.ts, src/**/*.ts
Metric: coverage % (higher is better)
Verify: npm test -- --coverage | grep "All files"
Guard: npm test
Iterations: 25

# Bug hunt
/autoresearch:debug
Symptom: API returns 500 on POST /users
Scope: src/api/**
Iterations: 15

# Adversarial review before shipping
/autoresearch:regression --predict --evals --fix --ship
```

## Why we use it

- Hard problems with a metric → autoresearch's loop does the boring iteration
- Bounded scope (specific files/globs) → safe to iterate unattended
- Local iteration would burn many turns (10+) → let autoresearch burn them for you
- Composes with `/mavis-ship`: when a task has a metric, autoresearch is the engine
