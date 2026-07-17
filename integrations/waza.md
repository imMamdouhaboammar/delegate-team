# Waza (tw93/Waza)

**Role**: Entry-point layer. 8 habits-engineering skills that map natural language to actions.

- **Repo**: https://github.com/tw93/Waza (6.1k⭐, MIT, v3.30.0)
- **Skills**: 8 at `~/.claude/skills/{think,ui,check,hunt,write,learn,read,health}/`
- **Install method**: `npx skills add` (works non-interactive with `-y`)

## Install (one command)

```bash
npx -y skills add tw93/Waza -a claude-code -g -y
```

This installs all 8 skills to `~/.claude/skills/` and updates on every
`npx skills update -g -y`.

## 8 skills at a glance

| Skill | Trigger | Function |
|---|---|---|
| `/think` | "plan / how should I / 出方案" | Pressure-test + design + decision-complete plan |
| `/ui` | "build the UI / frontend / design" | Distinctive UI with screenshot-driven iteration |
| `/check` | "review / 检查 / قبل merge" | Review diffs/PRs with evidence |
| `/hunt` | "bug / regression / مش شغال" | 4-phase root-cause debugging |
| `/write` | "polish / rewrite / حسّن copy" | Cut stiff, formulaic English/CN prose |
| `/learn` | "research / dive in / عايز أفهم" | 6-phase research: collect → digest → outline → fill → refine → publish |
| `/read` | "fetch / read url / PDF" | Smart URL+PDF reader |
| `/health` | "agent health / claude code health" | Audits Claude Code, Codex, project instructions |

## Canonical chain

Waza skills chain manually (one at a time):

```
Plan feature:  /think → approve → implement → /check → merge
Ship fix:      /hunt → fix → /check → release/push/publish
Research+write: /read → /learn → /write
Debug+verify:  /hunt → fix → /check
```

## Why we use it

- 8 skills cover the natural-language vocabulary users actually use
- Each skill has one clear trigger and one clear output — no overlap
- `/think` produces "decision-complete plans another agent can implement" — perfect
  hand-off target for `/apeiron` orchestrator
- `/check` is the universal review gate — runs at end of every chain
