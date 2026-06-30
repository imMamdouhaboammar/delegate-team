# superpowers (obra/superpowers)

**Role**: Methodology layer. Brainstorm-first hard gate → plan → TDD → review → ship.

- **Repo**: https://github.com/obra/superpowers (242k⭐, MIT, v6.0.3)
- **Skills**: 14 at `~/.claude/skills/{brainstorming,writing-plans,test-driven-development,systematic-debugging,verification-before-completion,dispatching-parallel-agents,executing-plans,subagent-driven-development,using-git-worktrees,requesting-code-review,receiving-code-review,finishing-a-development-branch,writing-skills,using-superpowers}`
- **Hook**: SessionStart auto-injects the `using-superpowers` skill at session start

## Install (manual, non-interactive)

```bash
# 1. Clone
git clone --depth 1 https://github.com/obra/superpowers /tmp/superpowers-repo

# 2. Copy skills to ~/.claude/skills/
for skill_dir in /tmp/superpowers-repo/skills/*/; do
    name=$(basename "$skill_dir")
    cp -r "$skill_dir" "$HOME/.claude/skills/$name"
done

# 3. Install SessionStart hook (rewrites ${CLAUDE_PLUGIN_ROOT} → absolute paths)
mkdir -p "$HOME/.claude/hooks/superpowers"
cp /tmp/superpowers-repo/hooks/run-hook.cmd "$HOME/.claude/hooks/superpowers/"
cp /tmp/superpowers-repo/hooks/session-start "$HOME/.claude/hooks/superpowers/"
chmod +x "$HOME/.claude/hooks/superpowers/run-hook.cmd" "$HOME/.claude/hooks/superpowers/session-start"

# 4. Symlink skills so PLUGIN_ROOT/skills/<name>/SKILL.md resolves correctly
#    (PLUGIN_ROOT = parent of script dir = ~/.claude/hooks)
mkdir -p "$HOME/.claude/hooks/skills"
for skill in brainstorming dispatching-parallel-agents executing-plans \
             finishing-a-development-branch receiving-code-review \
             requesting-code-review subagent-driven-development \
             systematic-debugging test-driven-development using-git-worktrees \
             using-superpowers verification-before-completion \
             writing-plans writing-skills; do
    ln -sf "$HOME/.claude/skills/$skill" "$HOME/.claude/hooks/skills/$skill"
done

# 5. Append SessionStart hook entry to settings.json
#    matcher: "startup|clear|compact", command: "$HOME/.claude/hooks/superpowers/run-hook.cmd session-start"
```

Or use the bundled script: `./install.sh --superpowers`

## Why we use it

- Hard-gates the AI reflex to dive into code without a design
- Encodes a proven workflow: brainstorm → write plan → TDD → verify → review → ship
- Provides 14 narrow skills, each with one job and a clear trigger (no overlap)
- Composes with `/mavis-ship`: `/think` (Waza) outputs a decision-complete plan →
  `writing-plans` (superpowers) expands to checkpoints → execute
