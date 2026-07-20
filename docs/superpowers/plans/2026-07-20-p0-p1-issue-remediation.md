# P0/P1 Open Issue Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining security acceptance gaps in issue #3 and finish the genuinely incomplete runtime reliability items in issue #4.

**Architecture:** Extract security-sensitive helpers into testable pure or narrowly side-effecting units. Preserve current CLI behavior unless the issue explicitly requires a stable contract. Add regression tests before implementation and keep local credentials, machine paths, and generated tokens outside logs, Git, and npm artifacts.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Commander, Node HTTP server, GitHub Actions, npm.

## Global Constraints

- Node.js support floor remains `>=24`.
- No new runtime dependency.
- Proxy binds to `127.0.0.1` by default.
- Config and token-bearing files use `0600`; private directories use `0700`.
- `DT_DEBUG` output must redact tokens, API keys, authorization values, and local secret values.
- Public Git and npm payloads must not include machine-specific paths or local overlays.

---

### Task 1: Complete issue #3 security acceptance coverage

**Files:**
- Modify: `src/commands/setup.ts`
- Modify: `src/proxy/server.ts`
- Create: `src/proxy/config.ts`
- Create: `tests/security-config.test.ts`
- Modify: `docs/SECURITY-MODEL.md`

**Interfaces:**
- Produces: `ensurePrivateDir(path: string): void`
- Produces: `writePrivateFile(path: string, content: string): void`
- Produces: `resolveProxyMaxBodyBytes(raw: string | undefined, warn?: (message: string) => void): number`
- Produces: `runServe(port: number, options?: { maxBodyBytes?: number }): http.Server`

- [ ] **Step 1: Write failing tests for private file modes**

Create temp directories and assert `ensurePrivateDir` returns mode `0700`; create an existing `0666` config file, call `writePrivateFile`, and assert mode `0600` and exact content.

- [ ] **Step 2: Write failing tests for proxy limits and bind address**

Assert default `2097152`, configured positive integer, invalid fallback warning, `runServe(0, { maxBodyBytes: 32 })` rejects a larger authenticated body with `413`, and `server.address().address` is `127.0.0.1`.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npx vitest run tests/security-config.test.ts`
Expected: FAIL because helpers/options are not exported or do not exist.

- [ ] **Step 4: Implement minimal security helpers**

Export setup file helpers without logging content. Move proxy limit parsing into `src/proxy/config.ts`. Pass the resolved per-server limit into the request handler instead of using a module-global constant.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npx vitest run tests/security-config.test.ts tests/security.test.ts`
Expected: PASS with no leaked token value in captured stdout/stderr.

- [ ] **Step 6: Document the tested behavior**

Update `docs/SECURITY-MODEL.md` with the private modes, configurable body limit, invalid-value fallback, constant-time token comparison, loopback binding, and local-only CORS behavior.

- [ ] **Step 7: Commit**

```bash
git add src/commands/setup.ts src/proxy/server.ts src/proxy/config.ts tests/security-config.test.ts docs/SECURITY-MODEL.md
git commit -m "test(security): enforce config and proxy contracts"
```

### Task 2: Standardize public CLI exit codes

**Files:**
- Create: `src/utils/exit-codes.ts`
- Modify: `src/commands/run.ts`
- Modify: `src/commands/route.ts`
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/check.ts`
- Modify: `src/config-check.ts`
- Modify: `src/cli.ts`
- Create: `tests/exit-codes.test.ts`
- Create: `DT.md`

**Interfaces:**
- Produces: `ExitCode.SUCCESS = 0`
- Produces: `ExitCode.FAILURE = 1`
- Produces: `ExitCode.USAGE = 64`
- Produces: `ExitCode.CONFIG = 78`
- Produces: `ExitCode.MISSING_DEPENDENCY = 127`

- [ ] **Step 1: Write failing tests for the contract**

Assert the exported constants and observable CLI behavior for missing arguments, invalid config, missing dependency, and successful `--version` execution.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run tests/exit-codes.test.ts`
Expected: FAIL because the shared constants do not exist and `dt run` still uses ad-hoc usage code `2`.

- [ ] **Step 3: Add constants and replace ad-hoc codes**

Use the shared constants in the listed public command surfaces. Preserve backend failure as `1` to avoid changing established automation; standardize usage as `64`, invalid configuration as `78`, and missing executables as `127`.

- [ ] **Step 4: Document the contract**

Create `DT.md` with a compact table, examples, and the guarantee that successful commands return `0`.

- [ ] **Step 5: Run focused and CLI tests**

Run: `npx vitest run tests/exit-codes.test.ts tests/cli.test.ts tests/router.test.ts tests/fallback.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exit-codes.ts src/commands/run.ts src/commands/route.ts src/commands/setup.ts src/commands/check.ts src/config-check.ts src/cli.ts tests/exit-codes.test.ts DT.md
git commit -m "refactor(cli): standardize exit codes"
```

### Task 3: Add safe debug diagnostics

**Files:**
- Create: `src/utils/debug.ts`
- Modify: `src/commands/run.ts`
- Modify: `src/config/runtime-paths.ts`
- Modify: `src/config/user-config.ts`
- Create: `tests/debug.test.ts`
- Modify: `docs/SECURITY-MODEL.md`
- Modify: `docs/INSTALLATION.md`

**Interfaces:**
- Produces: `isDebugEnabled(env?: NodeJS.ProcessEnv): boolean`
- Produces: `redactSensitive(value: unknown): string`
- Produces: `debugLog(scope: string, message: string, details?: unknown): void`

- [ ] **Step 1: Write failing redaction tests**

Cover Bearer tokens, API keys, proxy tokens, authorization headers, nested objects, and normal non-secret diagnostics. Assert no output when `DT_DEBUG` is absent.

- [ ] **Step 2: Run test and confirm RED**

Run: `npx vitest run tests/debug.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal debug utility**

Enable only for `DT_DEBUG=1` or `DT_DEBUG=true`. Serialize details safely, replace secret values with `[REDACTED]`, and write to stderr with a stable `[DT_DEBUG][scope]` prefix.

- [ ] **Step 4: Integrate router and path diagnostics**

Keep the user-facing fallback reason. Move raw router stderr, resolved runtime paths, and invalid-config diagnostics behind `debugLog` so normal output stays concise and secrets remain redacted.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/debug.test.ts tests/file-url-paths.test.ts tests/router.test.ts tests/user-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Document safe usage**

Document `DT_DEBUG=1`, the redaction guarantee, and the prohibition on treating debug logs as a credential export mechanism.

- [ ] **Step 7: Commit**

```bash
git add src/utils/debug.ts src/commands/run.ts src/config/runtime-paths.ts src/config/user-config.ts tests/debug.test.ts docs/SECURITY-MODEL.md docs/INSTALLATION.md
git commit -m "feat(debug): add redacted runtime diagnostics"
```

### Task 4: Verify, update GitHub issues, and prepare patch release

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Run complete verification**

Run: `npm run release:verify`
Expected: all Vitest, shell, audit, package smoke, and dry publish checks pass.

- [ ] **Step 2: Run security and privacy gates**

Run Gitleaks on the branch and packed tarball. Scan for `$HOME`, hostname, absolute user paths, `.env`, `.npmrc`, credential files, and local overlays.

- [ ] **Step 3: Update issues**

Close #3 as completed. Comment on #4 with each completed P1 item and close it only when Tasks 1-3 satisfy the final remaining items.

- [ ] **Step 4: Prepare the next patch version only after code verification**

Bump from `3.1.1` to the next unused patch, synchronize manifests and changelog, rerun `npm run release:verify`, then use the local maintainer publish flow.
