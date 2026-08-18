# Contributing to Delegate Team

Thanks for helping improve Delegate Team. Keep contributions focused, verifiable, and easy to review.

## Prerequisites

Use the supported development runtimes from `package.json` and the installation guide:

- Node.js 24 or newer
- npm
- Python 3.10 or newer
- Bash 4 or newer
- Git

For component-specific setup, see [docs/INSTALLATION.md](./docs/INSTALLATION.md).

## Pick and claim a focused task

Before changing code:

1. Search existing issues and pull requests for the same problem.
2. Prefer an existing focused issue with clear acceptance criteria.
3. Comment on the issue you intend to work on so maintainers and other contributors can avoid duplicate work.
4. Keep one pull request focused on one coherent issue or workstream.

Read [AGENTS.md](./AGENTS.md) and [CLAUDE.md](./CLAUDE.md) before changing repository behavior. They document repository-specific conventions and protected boundaries.

## Fork, clone, and branch

```bash
git clone https://github.com/<your-user>/delegate-team.git
cd delegate-team
git remote add upstream https://github.com/imMamdouhaboammar/delegate-team.git
git fetch upstream
git switch -c <type>/<short-description> upstream/master
```

Use a descriptive branch name such as `fix/mmas-status`, `test/router-thresholds`, or `docs/contributor-guide`. Do not commit directly to `master`.

## Install dependencies

Use the lockfile exactly as committed:

```bash
npm ci
```

Do not run release or publishing commands as part of normal contribution work.

## Develop and verify

Run the smallest relevant check while developing, then run the required project checks before opening a pull request.

### Focused tests

Run one Vitest file with:

```bash
npx vitest run tests/<test-file>.test.ts
```

For changed shell scripts, run both syntax checking and ShellCheck:

```bash
bash -n path/to/script.sh
shellcheck path/to/script.sh
```

GitHub Actions runs ShellCheck for repository shell scripts, so a shell change can fail CI even when `bash -n` succeeds. If ShellCheck is not installed locally, document that and rely on the CI shell-check job for that result rather than claiming it passed.

For changed Python files, also run:

```bash
python3 -m py_compile path/to/file.py
```

### Required checks

```bash
npm run node-support:check
npm run version:check
npm run typecheck
npm run lint
npm test
npm run build
```

The Node support and version-sync guards run in the normal PR CI path alongside typecheck, build, and tests. `npm run lint` is also part of the contributor preflight even when it is not exposed as a standalone GitHub Actions step. Fix failures introduced by your branch; do not weaken assertions or suppress errors just to make checks pass.

The dedicated npm package-integrity workflow runs on pull requests. If your change affects package contents, runtime entry points, manifests, or release integrity, also run:

```bash
npm run pack:verify
```

### Additional checks when relevant

Use these when your change affects the corresponding surface:

```bash
npm run config:check
npm run selftest
```

Installer work should also follow the safe preview and verification guidance in [docs/INSTALLATION.md](./docs/INSTALLATION.md).

## Repository-specific expectations

- Keep changes small and atomic.
- Add regression coverage for bug fixes and behavior changes whenever practical.
- Do not change routing rules without updating their tests and related documentation.
- Do not break `SKILL.md` frontmatter or plugin/marketplace metadata.
- If you change `install.sh`, update `INSTALL.md` in the same pull request.
- Avoid unrelated formatting or refactors in a focused fix.
- Do not add hard-coded model names outside the locations allowed by repository governance.

For current component boundaries and runtime flow, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Security and sensitive data

Never commit, paste into issues, or include in pull-request logs:

- API keys, tokens, passwords, cookies, or private keys
- `.env` values or local provider credentials
- private connection strings
- local user files or private configuration

If you discover a vulnerability, follow [SECURITY.md](./SECURITY.md) and report it privately rather than opening a public issue.

Do not broaden GitHub Actions permissions, add automatic publishing, create releases, or add release automation as part of an unrelated change.

## Pull request checklist

Before opening a pull request, confirm:

- [ ] The work is linked to one focused issue or clearly explains why no issue is needed.
- [ ] The branch is based on a current `master` commit.
- [ ] The diff contains no unrelated changes, generated noise, or secrets.
- [ ] Relevant regression tests were added or updated.
- [ ] `npm run node-support:check` passes.
- [ ] `npm run version:check` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] ShellCheck was run for changed shell scripts, or its CI-only status is documented.
- [ ] Package-affecting changes passed `npm run pack:verify`.
- [ ] Any additional component-specific checks were run and documented.
- [ ] Documentation and skills describe shipped behavior only.
- [ ] The PR body lists commands actually executed and any checks that were not run.

Open the pull request for independent review. Do not merge your own work solely because CI is green.

## More context

- [AGENTS.md](./AGENTS.md) — repository structure, naming, skills, and release policy
- [CLAUDE.md](./CLAUDE.md) — agent-specific repository constraints
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — current architecture and runtime boundaries
- [docs/INSTALLATION.md](./docs/INSTALLATION.md) — installation lanes, prerequisites, verification, and troubleshooting
- [SECURITY.md](./SECURITY.md) — supported versions and private vulnerability reporting
