# Immediate Sprint Plan

## Sprint Target

Ship `v0.1.0` as the first stabilization release after `v0.0.4`.

## Sprint Theme

Reliability before features.

The goal is not to add more integrations. The goal is to make the current foundations safer, easier to debug, and easier to upgrade.

## Scope

### Task 1: Refactor command structure

- split command handlers from shared core utilities
- keep `dist/cli.mjs` runnable without build
- prepare for future TypeScript source files

Acceptance:

- all existing commands still work
- smoke test passes
- `node dist/cli.mjs --help` works

### Task 2: Add config commands

Commands:

```bash
agent-kernel config show
agent-kernel config set <key> <value>
agent-kernel config path
```

Acceptance:

- config file can be inspected
- invalid config keys are rejected
- config changes are logged

### Task 3: Add stricter validation

Commands:

```bash
agent-kernel validate --strict
```

Acceptance:

- invalid memory JSON fails
- invalid proposal JSON fails
- critical policies without enforcement fail in strict mode

### Task 4: Add duplicate detection baseline

Commands:

```bash
agent-kernel memory duplicates
```

Acceptance:

- same `text` detected
- same normalized title detected
- duplicate proposals detected against approved memories

### Task 5: Add conflict detection baseline

Commands:

```bash
agent-kernel memory conflicts
```

Acceptance:

- exact contradiction markers are detected
- examples are covered by fixtures
- output is readable and actionable

### Task 6: Add backup and restore

Commands:

```bash
agent-kernel backup
agent-kernel restore <backup-file>
```

Acceptance:

- backup includes source, inbox, dist, and config
- backup excludes logs unless requested
- restore refuses to overwrite unless `--force` is passed

### Task 7: Improve doctor

Commands:

```bash
agent-kernel doctor --verbose
```

Acceptance:

- detects missing kernel root
- detects broken symlinks
- detects missing agent files
- detects invalid JSON
- detects disabled Claude hooks

### Task 8: Add test fixtures

Files:

```txt
test/fixtures/valid-kernel/
test/fixtures/invalid-memory/
test/fixtures/duplicate-rules/
test/fixtures/conflicting-rules/
```

Acceptance:

- smoke test uses fixtures
- tests run without internet
- tests do not touch real home directory

## Out of Scope

- TUI
- team sync
- Semgrep integration
- OPA integration
- plugin SDK
- remote sync

## Sprint Exit Criteria

- `npm test` passes
- `agent-kernel validate --strict` passes on a fresh init
- `agent-kernel doctor --verbose` gives actionable output
- package can be installed with `npm link`
- package can run without build step
