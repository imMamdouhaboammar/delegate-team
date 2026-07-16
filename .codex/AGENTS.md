# ECC for Codex CLI

This file supplements the root `AGENTS.md` with a repository-local ECC baseline. Root governance and current repository code remain authoritative.

## Repository skill

- Codex-facing skill: `.agents/skills/delegate-team/SKILL.md`
- Claude-facing companion: `.claude/skills/delegate-team/SKILL.md`
- Keep user credentials and private MCP configuration outside the repository.

## MCP baseline

Treat `.codex/config.toml` as an optional repository baseline. Review every server before use and keep secrets in user-level configuration or approved environment storage.

## Multi-agent support

- Explorer: read-only evidence gathering
- Reviewer: read-only correctness, security, and regression review
- Docs researcher: read-only verification against primary documentation

The role configurations are stored under `.codex/agents/` and use read-only sandboxes.

## Development workflow

No dedicated ECC command files are included. Use the repository skill and existing repository commands instead:

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run version:check
```

For package changes, also run `npm pack --dry-run`. Do not treat generated ECC metadata as proof that repository checks passed.
