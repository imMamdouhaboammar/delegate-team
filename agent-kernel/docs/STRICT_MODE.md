# Strict Mode

Strict mode means important rules are not only injected as context. They are enforced mechanically.

## Enforcement levels

```txt
0 Context only
1 Session reminder
2 Warning
3 Local block through hooks
4 Commit block through git hooks
5 Merge block through CI
```

Critical rules should target level 4 or 5 where possible.

## Built-in local blocks

Agent Kernel currently blocks:

- `rm -rf /`, `rm -rf ~`, and related destructive forms
- remote `curl | sh` and `wget | sh`
- `chmod -R 777`
- force-pushing to main/master
- deleting `.git`
- using npm/yarn install commands in a pnpm repo
- writing protected paths like `.env`, `.git`, `node_modules`, service-account files, and secrets folders
- hardcoded secrets in source files
- suspicious SQLite fallback patterns in Supabase projects
- possible hardcoded production data arrays

## Manual guard

```bash
agent-kernel guard
agent-kernel guard --staged
```

## Git hook

```bash
agent-kernel git-hook install .
```

## CI

Copy `examples/github-agent-kernel-guard.yml` into `.github/workflows/agent-kernel-guard.yml` and adjust the install step depending on how you publish or vendor Agent Kernel.
