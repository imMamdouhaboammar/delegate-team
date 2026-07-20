# ChatGPT Remote Agent Design

## Goal

Add a production-ready onboarding and workspace-control layer that lets a user connect Remote Desktop Commander to ChatGPT manually, paste a ready-made bootstrap prompt into a normal ChatGPT session, install `delegate-team`, and choose whether ChatGPT acts as the coding agent, the delegator, or both.

## Product boundary

`delegate-team` does not install or register Remote Desktop Commander inside ChatGPT. The user completes that connection first using the connector's own setup and ChatGPT's Apps/MCP interface. The package then provides the bootstrap prompt, local diagnostics, workspace policy, agent discovery, and project-specific operating instructions.

The initial release does not add a webhook server, background daemon, public port, or remote task API. Those capabilities can be added later without changing the workspace policy schema.

## User flow

1. The README explains that the user must connect Remote Desktop Commander to their computer and ChatGPT before continuing.
2. The user copies the bootstrap prompt from the README or runs `dt remote bootstrap`.
3. In a new ChatGPT session, the prompt instructs ChatGPT to perform non-destructive terminal and filesystem checks.
4. ChatGPT tells the user before installing `delegate-team` globally, installs it with npm, and verifies `dt --version` and `dt doctor`.
5. ChatGPT asks the user to choose Coding Agent, Delegator, or Hybrid mode.
6. Coding Agent mode asks for the absolute project path, task, and Git/package-install permissions.
7. Delegator mode asks which local coding-agent CLIs the user wants, checks installation/authentication, and runs safe read-only response tests.
8. Hybrid mode keeps ChatGPT as the primary agent and uses `dt delegate` for specialist tasks.
9. For a project, `dt remote init <path>` creates a local policy contract and a project-specific ChatGPT instruction file.

## CLI contract

### `dt remote bootstrap`

Prints the exact copy-ready bootstrap prompt shipped in the README. It performs no writes and makes no network calls.

### `dt remote init [project]`

Initializes the target project, defaulting to the current working directory. The target must already exist and must be a directory. The command creates:

- `.delegate-team/remote-agent.json`
- `.delegate-team/policy.json`
- `.delegate-team/session-state.json`
- `.delegate-team/.gitignore`
- `.delegate-team/logs/.gitkeep`
- `CHATGPT_REMOTE_AGENT.md`

Safe defaults deny dependency installation, deletion, push, merge, publish, system changes, secret reading, and access outside the declared workspace. The command is idempotent and preserves an existing policy unless `--force` is supplied.

### `dt remote doctor [project]`

Checks the target path, Node.js, npm, Git, `dt`, project initialization, and detected coding-agent CLIs. Human output is the default; `--json` emits machine-readable output. Optional missing agents do not make the command fail. Invalid target paths and missing required core tools do.

### `dt remote agents`

Detects known local coding-agent CLIs using the current `PATH`, reports executable path and version, and supports `--json`. Detection must not print environment variables, tokens, auth files, or credentials.

### `dt remote prompt [project]`

Prints the generated `CHATGPT_REMOTE_AGENT.md` for an initialized project. It fails with a clear instruction to run `dt remote init` when the project is not initialized.

### `dt remote status [project]`

Reads and validates the workspace metadata and policy, then prints the approved root and current permissions. Supports `--json`.

## Workspace policy schema

The policy is JSON with a stable schema identifier and explicit booleans:

- `workspaceRoot`
- `allowDependencyInstall`
- `allowDelete`
- `allowCommit`
- `allowPush`
- `allowMerge`
- `allowPublish`
- `allowSystemChanges`
- `allowSecretRead`
- `requireFeatureBranch`
- `requireBaselineTests`
- `requireFinalVerification`
- `requireDiffReview`

The generated ChatGPT instructions require the agent to treat delegated output as untrusted, review diffs, rerun tests independently, avoid secrets, and stay within the approved root.

## Agent discovery

The first release probes these command candidates without shell interpolation:

- Codex: `codex`
- Claude Code: `claude`
- Gemini CLI: `gemini`
- OpenCode: `opencode`
- Kimi: `kimi`
- MiniMax: `mmx`, then `minimax`
- Grok: `grok`
- AGY: `agy`

A probe is considered installed when the executable is resolvable. Version checks use bounded subprocess timeouts and tolerate tools that do not support `--version`.

## README onboarding

The README contains:

- A visible warning that the prompt will test terminal/filesystem access and install `delegate-team` globally after informing the user.
- Manual MCP connection steps, with an availability note because ChatGPT MCP permissions and UI can vary by plan and connector.
- One complete copy-ready bootstrap prompt in a fenced block.
- The three operating modes and expected next questions.
- Commands for `dt remote init`, `doctor`, `agents`, `prompt`, and `status`.

## Security and error handling

- No `sudo` is used automatically.
- No agent CLI is installed automatically during bootstrap; the user chooses agents first.
- No authentication token is requested in chat.
- No project is modified before the user provides or approves its path.
- Existing policies are not overwritten without `--force`.
- JSON files are written atomically and local session/log files are ignored by Git.
- All filesystem paths are canonicalized with real paths to handle spaces, reserved URL characters, and symlinks.

## Testing

Tests cover bootstrap prompt content, safe defaults, initialization in paths containing spaces and `#`, idempotency, overwrite protection, status/prompt failures before initialization, agent discovery with fake executables, doctor JSON output, CLI registration, package contents, and a packed-tarball smoke test.

## Release

Release as `delegate-team@3.1.0`. Update package manifests, lockfile, README, installation/security documentation, and changelog. Merge verified changes to `master`, push GitHub, publish npm, verify the registry version, and install the published package in a temporary project.
