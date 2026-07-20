# File URL Path Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Delegate Team routers and backend discovery work correctly when installed or executed from filesystem paths containing spaces or URL-encoded characters.

**Architecture:** Convert `import.meta.url` with Node's `fileURLToPath()` before any filesystem operation. Replace raw `file://` entrypoint comparisons with resolved filesystem-path comparisons, and verify all affected backends through isolated fake CLI processes.

**Tech Stack:** Node.js ESM, Vitest, TypeScript tests, POSIX fake executables.

## Global Constraints

- Do not call real LLM providers or production services.
- Use temporary directories, fake CLIs, and isolated HOME values in regression tests.
- Keep the change focused on file URL and entrypoint path handling.
- Preserve existing routing and account-selection behavior.

---

### Task 1: Reproduce router and relay failures under paths with spaces

**Files:**
- Create: `tests/file-url-paths.test.ts`
- Test: `delegate-team/scripts/relay.mjs`
- Test: `delegate-team/scripts/codex-router.mjs`
- Test: `delegate-team/scripts/gemini-router.mjs`
- Test: `delegate-team/scripts/opencode-router.mjs`

- [x] Write a test that copies each router into a temporary directory containing spaces, executes its `route` command, and expects parseable JSON.
- [x] Write a test that runs a copied relay with `--account secondary` and a fake Codex CLI, then asserts the selected `CODEX_HOME` is the secondary account.
- [x] Write a test that provides both workspace-local and PATH fallback fake Python executables, then asserts VertexCoder selects the workspace-local runtime.
- [x] Run `npx vitest run tests/file-url-paths.test.ts` and verify the tests fail for the encoded-path behavior.

### Task 2: Replace unsafe URL pathname handling

**Files:**
- Modify: `delegate-team/scripts/relay.mjs`
- Modify: `delegate-team/scripts/codex-router.mjs`
- Modify: `delegate-team/scripts/gemini-router.mjs`
- Modify: `delegate-team/scripts/opencode-router.mjs`

- [x] Import `fileURLToPath` from `node:url` and derive the script filename and directory once in `relay.mjs`.
- [x] Replace every `new URL(import.meta.url).pathname` filesystem conversion with the decoded script directory or workspace root.
- [x] Replace each raw `file://${process.argv[1]}` main-module comparison with resolved filesystem paths based on `fileURLToPath(import.meta.url)`.
- [x] Run the focused regression test and verify all cases pass.

### Task 3: Verify repository-wide safety

**Files:**
- Modify only if verification reveals another unsafe filesystem conversion.

- [x] Search tracked source for remaining `.pathname` conversions of `import.meta.url` and raw `file://${process.argv[1]}` comparisons.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `npm run version:check`.
- [x] Run the real local relay in read-only mode with a fake Codex executable from the existing repository path containing spaces.
- [x] Review `git diff --check` and the final diff.
- [x] Commit the focused fix without pushing or merging.
