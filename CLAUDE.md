# CLAUDE.md

This file gives Claude Code (and other Claude-flavored agents) specific
guidance when working inside this repository.

## Repo identity

This is `delegate-team` — an agentic engineering supersystem. **You are working
on the supersystem itself, not a downstream application.** Convention overrides:

- **Treat `SKILL.md` files as the highest-priority deliverable.** Each
  `SKILL.md` (root and per-component) is a user-facing manifest. Don't break
  their frontmatter.
- **Touch `dt` CLI TypeScript only if the user asks.** It's stable; bugfixes
  yes, refactors no.
- **The orchestrator's routing rules are documented + tested.** Don't change
  `orchestrator/scripts/orchestrate.sh` regexes without updating
  `orchestrator/SKILL.md` and `orchestrator/README.md`.

## Skill discovery & application

When a user prompt arrives, load the right skills via the Skill tool:

| Prompt signal | Load these skills (in order) |
|---|---|
| "Build X / Make X faster / Refactor X" | `using-superpowers`, `brainstorming`, `delegate-team` |
| "Review my code / Check X" | `using-superpowers`, `verification-before-completion`, `delegate-team` |
| "Bug / Fix / Broken" | `using-superpowers`, `systematic-debugging`, `mmas` |
| "Design X for [domain]" | `brainstorming`, `delegate-team` (orchestrator only) |
| "Research / Learn X" | `read` (Waza), `learn` (Waza), `superpowers:research` patterns |

If `delegate-team` skill is loaded, it WILL run its own routing. You don't
need to second-guess it. Just follow the chain it prescribes:

```
/think → unslop audit (UI gate) → writing-plans → autoload backends →
/check → quality-guard → SHIP
```

## Hard rules

1. **Never edit `install.sh`** without also updating `INSTALL.md`.
2. **Never add a new top-level directory** without updating the README's
   component table and adding it to both `.claude-plugin/plugin.json` and
   `skills.sh.json`.
3. **Never commit to `master` directly.** Use a feature branch. The CI runs
   `tsc --noEmit`, `vitest`, and shellcheck on every PR.
4. **Never run a Write or Edit on `node_modules/`** — gitignored, full disk
   accident. Skip it.
5. **Never hard-code model names** outside `mmas/agents/*.yaml`. The user's
   preferred models may change; keep them swappable.

## Tool preferences in this repo

| Task | Tool |
|---|---|
| Read existing skill manifest | `Read` then `Skill` to actually load |
| Add a new component | `Bash` for mkdir, then Write |
| Search for skills to extend | `Grep` for `SKILL.md` |
| Update changelog | `Edit` `CHANGELOG.md` |
| Bump version | Multi-file Edit across `package.json`, `plugin.json`, `marketplace.json` |
| Verify everything still works | `Bash` then `./install.sh --verify` |

## Testing

- Existing TypeScript tests: `npm test` (vitest)
- Skill structure validation: `mavis-skill-scaffold --validate <name>`
- Installer verification: `./install.sh --verify`
- All-must-pass before commit.

## When unsure

Read `AGENTS.md` first — it has the repo's conventional decisions documented.
If still unsure, prefer to ask the user rather than guess. This is a
production-grade supersystem; "wrong guess" compounds.
