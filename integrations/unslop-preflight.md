# unslop-preflight

**Role**: Pre-implementation UI quality gate. 23 reasoning gates that block generic
AI-generated UI slop at the artifact layer (`PRODUCT.md` / `DESIGN.md` / `AGENTS.md`).

- **Repo**: https://github.com/imMamdouhaboammar/unslop-preflight (v1.9.8, MIT)
- **CLI**: `npm install -g unslop-preflight` → exposes `unslop` command
- **Skill manifest**: `~/.claude/skills/unslop/SKILL.md`
- **Mandatory before ANY UI work**

## Install (one command)

```bash
git clone --depth 1 https://github.com/imMamdouhaboammar/unslop-preflight /tmp/unslop
npm install -g /tmp/unslop
cp -r /tmp/unslop/SKILL.md "$HOME/.claude/skills/unslop/SKILL.md"
```

## Usage

```bash
cd <project-root>

unslop doctor      # 0-100 score, runtime + project assumptions
unslop audit       # Run 23 gates, get readiness band
unslop autopilot   # Full loop: init → audit → safe repair → final report
```

## Readiness bands (BLOCKING)

| Score | Band | Action |
|---|---|---|
| 0–49 | `blocked` | Don't start coding. Resolve errors first. |
| 50–69 | `needs-spec-work` | Fix the spec gaps before coding. |
| 70–89 | `agent-ready-with-fix-list` | OK to code, but address the fix list. |
| 90–100 | `agent-ready` | Ship it. |

## 23 gates (subset)

- **Modals**: width/height guards, internal scroll, mobile behavior, no scroll trap
- **Stacking**: blocks blind `z-9999` fixes without reasoning about stacking contexts
- **A11y**: WCAG 2.2 AA, focus rings, keyboard nav, ARIA labels
- **Mobile**: viewport-fit, safe areas, dynamic vh units (no `100vh` jumps)
- **Design system**: typography scale, color tokens, spacing — no placeholder values
- **No AI slop**: blocks `[audience]`, `[Feature 1]`, TODO, TBD placeholders
- **Install Agent Harness**: recommends only what's needed (no bulk install)
- **Taste calibration**: DESIGN_VARIANCE / MOTION_INTENSITY / VISUAL_DENSITY must be set

## Why we use it

- AI-generated UI has a recognizable fingerprint (gradient soup, default shadcn,
  generic copy, broken mobile, blind z-index). unslop-preflight enforces taste.
- Spec-time gate is cheaper than delivery-time gate. Fix the design doc, not the
  production build.
- Mandatory in `/mavis-ship` UI path: `unslop audit` BLOCKS execution if score <70.
