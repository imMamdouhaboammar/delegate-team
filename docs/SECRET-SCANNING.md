# Secret scanning

`delegate-team` runs Gitleaks on every pull request, every push to `main` or `master`, and manual workflow runs.

## What the gate checks

The workflow checks the full repository history available to the runner and the commits introduced by a pull request. It uses the upstream Gitleaks default rules through `.gitleaks.toml`.

No directory is globally excluded. Source files, scripts, examples, documentation, fixtures, configuration, generated output, and workflow files remain in scope when committed.

## Log and artifact safety

The workflow pins the checkout and Gitleaks actions to immutable release commits. Checkout credential persistence is disabled.

Gitleaks Action v3 invokes the scanner with full redaction enabled. PR comments and SARIF artifact uploads are disabled so a finding is not copied into review comments or retained as an Actions artifact.

## When the workflow fails

1. Treat the detected value as exposed until proven otherwise.
2. Revoke or rotate the credential before editing Git history.
3. Remove the value from the current branch and, when necessary, purge it from affected history.
4. Re-run the workflow and confirm that the finding is gone.
5. Review logs and downstream systems for suspicious use.

Do not add a broad allowlist entry to make CI pass.

## False positives

A suppression is acceptable only when the value is deterministic, cannot authenticate to any service, and is required for a test or example.

Prefer adding the exact finding fingerprint to `.gitleaksignore`. Document why the value is safe and include a regression test when practical. Do not exclude a directory or file category globally.

## Local check

Install Gitleaks, then run:

```bash
gitleaks git --config .gitleaks.toml --redact=100 --verbose .
```

The `git` command is the current Gitleaks command for repository-history scans. Keep full redaction enabled whenever output may be shared.

## Scope decisions

The workflow has read-only repository permissions. It does not post PR comments or upload findings as artifacts. The job is time-bounded and uses concurrency cancellation to stop superseded runs.
