import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RemoteMetadata, RemotePolicy } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_FILENAME = 'chatgpt-remote-bootstrap.md';

function resolveBootstrapPath(): string {
  const candidates = [
    join(here, '..', '..', 'templates', BOOTSTRAP_FILENAME),
    join(here, '..', 'templates', BOOTSTRAP_FILENAME),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error(
      `Remote bootstrap template is missing. Expected ${BOOTSTRAP_FILENAME} in the package templates directory.`,
    );
  }
  return path;
}

export function getBootstrapPrompt(): string {
  return readFileSync(resolveBootstrapPath(), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

function permission(value: boolean): string {
  return value ? 'allowed' : 'not allowed';
}

export function buildProjectPrompt(
  metadata: RemoteMetadata,
  policy: RemotePolicy,
): string {
  return `# ChatGPT Remote Agent Workspace

This project is configured for ChatGPT through Remote Desktop Commander and delegate-team.

## Approved workspace

- Absolute root: \`${metadata.workspaceRoot}\`
- Project: ${metadata.projectName}
- Policy schema: \`${policy.schema}\`

Do not read, create, modify, move, or delete anything outside the approved workspace root.
Resolve and validate every target path before using it.

## Current permissions

- Dependency installation: ${permission(policy.allowDependencyInstall)}
- File deletion: ${permission(policy.allowDelete)}
- Git commits: ${permission(policy.allowCommit)}
- Git push: ${permission(policy.allowPush)}
- Git merge: ${permission(policy.allowMerge)}
- Package publishing: ${permission(policy.allowPublish)}
- Persistent system changes: ${permission(policy.allowSystemChanges)}
- Secret or credential reading: ${permission(policy.allowSecretRead)}

Permissions are deny-by-default. Ask the user before an action that is not allowed here.

## Required workflow

- Read repository instructions before editing.
- Run baseline tests and final verification.
- Use \`dt remote agents\` to inspect local agents.
- Use \`dt delegate\` only for approved specialist work.
- Review delegated diffs and rerun tests independently.
- Do not read secrets or credential files.
- Use Playwright when browser validation is required.
`;
}
