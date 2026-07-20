# ChatGPT Remote Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dt remote` and a copy-ready README bootstrap prompt that turns a connected ChatGPT session into a governed local coding agent or delegator.

**Architecture:** Keep the bootstrap prompt, workspace policy generation, agent discovery, and CLI orchestration in focused TypeScript modules. Use canonical filesystem paths, safe deny-by-default policy files, fake executables in tests, and no daemon or webhook in this release.

**Tech Stack:** TypeScript, Node.js ESM, Commander, Vitest, npm packaging.

## Global Constraints

- Release version is `3.1.0`.
- Remote Desktop Commander connection remains a manual prerequisite documented in README.
- Never use `sudo`, expose secrets, or install coding-agent CLIs automatically.
- Default policy denies install, delete, push, merge, publish, system changes, and secret access.
- All project writes stay under the canonical approved workspace root.
- Follow Red, Green, Refactor for each behavior.

---

### Task 1: Define remote-agent behavior with failing tests

**Files:**
- Create: `tests/remote-agent.test.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/package-files.test.ts`

**Interfaces:**
- Consumes: future exports from `src/remote/agents.ts`, `src/remote/workspace.ts`, `src/remote/prompts.ts`, and `src/commands/remote.ts`.
- Produces: executable behavioral contract for initialization, policy, discovery, doctor, prompt, status, and CLI registration.

- [ ] Write tests for the bootstrap prompt's terminal checks, disclosed global install, `dt doctor`, and three-mode question.
- [ ] Write tests for initialization in a path containing spaces and `#`, deny-by-default policy, generated files, idempotency, and `--force` overwrite behavior.
- [ ] Write tests for fake CLI discovery, missing optional agents, doctor JSON, prompt/status before and after initialization.
- [ ] Add CLI help and npm package whitelist expectations for `dt remote` and the shipped prompt template.
- [ ] Run `npx vitest run tests/remote-agent.test.ts tests/cli.test.ts tests/package-files.test.ts` and verify failures are caused by missing production code.

### Task 2: Implement remote-agent modules and CLI

**Files:**
- Create: `src/remote/types.ts`
- Create: `src/remote/agents.ts`
- Create: `src/remote/prompts.ts`
- Create: `src/remote/workspace.ts`
- Create: `src/commands/remote.ts`
- Create: `templates/chatgpt-remote-bootstrap.md`
- Modify: `src/cli.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `discoverAgents()`, `getBootstrapPrompt()`, `initializeRemoteWorkspace()`, `readRemoteWorkspace()`, `buildRemoteDoctorReport()`, and `registerRemoteCommands()`.
- Consumes: Node filesystem, path, process, and child-process APIs only.

- [ ] Implement bounded, credential-safe executable discovery with deterministic JSON results.
- [ ] Implement the bootstrap prompt as a shipped template and loader.
- [ ] Implement canonical-path initialization, atomic JSON writes, safe policy defaults, and generated ChatGPT project instructions.
- [ ] Implement doctor, agents, bootstrap, prompt, status, and init command handlers.
- [ ] Register `dt remote` and add it to unknown-command validation.
- [ ] Run focused tests until all remote-agent tests pass.

### Task 3: Document onboarding and security

**Files:**
- Modify: `README.md`
- Modify: `docs/INSTALLATION.md`
- Modify: `docs/SECURITY-MODEL.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the exact bootstrap template and CLI behavior from Task 2.
- Produces: complete user onboarding from manual MCP connection through mode selection and project initialization.

- [ ] Add a README lane for ChatGPT Web + Remote Desktop Commander with prerequisite, disclosure, copy-ready prompt, three modes, and command examples.
- [ ] Document plan/connector availability caveats and manual MCP connection responsibility without claiming npm can connect ChatGPT automatically.
- [ ] Document workspace files, deny-by-default permissions, threat boundary, and delegated-output verification.
- [ ] Add the `3.1.0` changelog entry covering the path fixes, Python 3.9 fix, and remote-agent feature.
- [ ] Verify README's fenced prompt matches `dt remote bootstrap` byte-for-byte through a test.

### Task 4: Version and package the release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `README.md`

**Interfaces:**
- Produces: synchronized `3.1.0` release metadata and tarball contents.

- [ ] Set all guarded version fields to `3.1.0` and refresh lockfile metadata.
- [ ] Run `npm run version:check` and fix every mismatch.
- [ ] Run `npm pack --dry-run` and verify the prompt template and runtime files are present.
- [ ] Install the generated tarball in a temporary project and run `dt remote bootstrap`, `dt remote init`, `dt remote status --json`, and `dt remote doctor --json`.

### Task 5: Full verification, merge, GitHub push, and npm publish

**Files:**
- Modify only when a release gate reveals a real defect.

**Interfaces:**
- Consumes: all completed implementation and documentation.
- Produces: verified GitHub `master` and npm `delegate-team@3.1.0`.

- [ ] Run `git diff --check`, typecheck, lint, build, full tests, selftest, version check, shell syntax checks, Python compile checks, JSON validation, and npm publish dry run.
- [ ] Review the complete diff and commit the implementation in focused commits.
- [ ] Merge the feature branch into local `master` without rewriting history.
- [ ] Re-run release gates on merged `master`.
- [ ] Push the verified default branch to the configured GitHub remote.
- [ ] Publish the verified `delegate-team@3.1.0` package with public access.
- [ ] Verify the registry version and install the published package in a clean temporary directory.
