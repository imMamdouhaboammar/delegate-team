# Secret scanning

`delegate-team` runs Gitleaks on every pull request, every push to `master`, and manual workflow runs.

## What the gate checks

The workflow checks the repository history available to the runner and the changes introduced by a pull request. It uses the upstream Gitleaks default rules plus the narrow path exclusions in `.gitleaks.toml`.

The exclusions cover generated dependency, build, and coverage output only. Source files, scripts, examples, documentation, fixtures, configuration, and workflow files remain in scope.

## When the workflow fails

1. Treat the detected value as exposed until proven otherwise.
2. Revoke or rotate the credential before editing Git history.
3. Remove the value from the current branch and, when necessary, purge it from affected history.
4. Re-run the workflow and confirm that the finding is gone.
5. Review logs and downstream systems for suspicious use.

Do not add a broad allowlist entry to make CI pass.

## False positives

A suppression is acceptable only when the value is deterministic, cannot authenticate to any service, and is required for a test or example.

Keep suppressions local and explicit. Prefer a rule-specific stopword, commit, path, or regular expression over excluding a directory. Add a comment that explains why the value is safe and include a regression test when practical.

## Local check

Install Gitleaks, then run:

```bash
gitleaks git --config .gitleaks.toml --redact --verbose
```

Use `--redact` when sharing output so detected values are not copied into logs, issues, or pull requests.

## Scope decisions

The workflow has read-only repository permissions. It does not upload findings as artifacts because artifacts can preserve sensitive values. The job is time-bounded and uses concurrency cancellation to avoid wasting runners on superseded commits.
