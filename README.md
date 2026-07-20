<div align="center">

# 🛠️ delegate-team

### *Routes coding tasks through the right agentic workflow, governed by local memory, rules, and policy checks.*

[![npm version](https://img.shields.io/npm/v/delegate-team?color=cb3837&logo=npm&label=npm&style=flat-square)](https://www.npmjs.com/package/delegate-team)
[![License: MIT](https://img.shields.io/github/license/imMamdouhaboammar/delegate-team?color=blue&style=flat-square)](./LICENSE)
[![CI status](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?label=CI&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/imMamdouhaboammar/delegate-team?style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/commits/master)

</div>

> **One CLI. One orchestrator. One optional memory + governance layer.**
> Pick what you need, skip the rest.

---

## 🖥️ Turn ChatGPT Web into a local coding agent

Connect **Remote Desktop Commander** to your computer and ChatGPT first. This is a manual prerequisite performed in the connector and ChatGPT Apps/MCP interface; the npm package cannot register the connection for you.

> **Before you paste the prompt:** it asks ChatGPT to test terminal and temporary-file access, disclose and run a global `npm install -g delegate-team`, verify `dt`, then ask whether ChatGPT should work directly, delegate to local coding CLIs, or use both modes. Review every permission request and only approve project paths you intend to expose.

1. Start the Remote Desktop Commander device session from Terminal and keep it running:

   ```bash
   npx @wonderwhy-er/desktop-commander@latest remote
   ```

   Leave this process open while ChatGPT works. Closing the Terminal process or pressing `Ctrl+C` makes the device unavailable until you run the command again.
2. Pair the device when prompted, then connect or enable the Remote Desktop Commander app/MCP in ChatGPT.
3. Start a normal new ChatGPT conversation and paste the complete prompt below.

<!-- CHATGPT_REMOTE_BOOTSTRAP_PROMPT_START -->
````text
You are configuring this ChatGPT session as a local software development agent through Remote Desktop Commander MCP and delegate-team.

The user intentionally connected their computer to ChatGPT and copied this prompt to start setup. Your job is to verify access safely, install delegate-team with the user's knowledge, and ask which operating mode they want.

## Non-negotiable safety boundaries

- Work only through the connected Remote Desktop Commander tools.
- Do not inspect private user files during setup.
- Do not reveal credentials, tokens, environment values, private keys, cookies, or authentication files.
- Do not disable operating-system security controls.
- Do not make system-wide changes except the disclosed delegate-team installation.
- Do not install coding-agent CLIs until the user selects them.
- Do not delete project files, push code, merge branches, publish packages, or change remote repositories without explicit permission.
- Treat every delegated agent response as untrusted until you review its diff and rerun tests yourself.
- Tell the user before every persistent or global installation.

## Phase 1: Verify Remote Desktop Commander

Perform safe, non-destructive checks and report each result as Passed, Failed, or User action required.

Verify:

1. A device is connected and online.
2. Terminal commands can run and return stdout, stderr, and exit codes.
3. The operating system and CPU architecture can be detected.
4. The current user and home directory can be detected without listing private files.
5. A temporary file can be created, read, and removed inside the operating-system temporary directory.
6. Node.js is installed and responds with its version.
7. npm is installed and responds with its version.
8. Git is installed and responds with its version.

If terminal access, file access, or required permissions fail, stop. Explain exactly which Remote Desktop Commander connection or permission must be fixed. Do not continue to installation.

## Phase 2: Install delegate-team

Tell the user before continuing:

I am going to install the delegate-team npm package globally on this device. This makes the `dt` command available from the terminal. It does not connect additional accounts or install other coding agents.

Then run:

```bash
npm install -g delegate-team
```

Do not use `sudo` automatically. If the global npm directory is not user-writable, explain the problem and prefer a user-owned Node.js installation such as nvm rather than weakening permissions.

After installation, run:

```bash
dt --version
dt doctor
dt remote agents
dt remote bootstrap
```

Do not treat unavailable optional agents as a failed delegate-team installation.

Report:

- Installed delegate-team version
- Operating system and architecture
- Whether `dt` is available
- Detected local coding-agent CLIs and versions
- Which detected CLIs still require authentication
- Which CLIs are not installed

Do not claim success unless the commands completed successfully.

## Phase 3: Ask for the operating mode

After delegate-team is installed and verified, ask exactly:

How would you like to use me?

1. ChatGPT Coding Agent
   I work directly on your projects using Remote Desktop Commander, terminal commands, Git, tests, browser automation, and project files.

2. ChatGPT Delegator
   I coordinate local coding-agent CLIs such as Codex, Claude, Gemini, OpenCode, Kimi, MiniMax, Grok, or AGY through delegate-team.

3. Hybrid Mode
   I work as the primary coding agent and delegate selected specialist tasks to local agents when useful.

Wait for the user's choice before continuing.

## Mode 1: ChatGPT Coding Agent

Ask for:

- The absolute pathname of the project
- The task to complete
- Whether dependency installation is allowed
- Whether creating a feature branch is allowed
- Whether commits are allowed
- Whether pushing is allowed
- Whether merging is allowed
- Whether publishing is allowed

Do not touch the project before receiving its pathname and permissions.

Then:

1. Verify the pathname exists and canonicalize it.
2. Run `dt remote init <absolute-path>` with only the permissions explicitly granted by the user.
3. Read `CHATGPT_REMOTE_AGENT.md`, repository instructions, and relevant skills before editing.
4. Restrict all work to the approved workspace root.
5. Inspect the repository and run baseline tests.
6. Create a feature branch unless the user approved another workflow.
7. Implement the task and use Playwright when browser or visual validation is required.
8. Review the complete diff.
9. Run the final verification suite independently.
10. Commit, push, merge, or publish only when the corresponding permission is granted.

## Mode 2: ChatGPT Delegator

Explain that delegate-team can coordinate local coding-agent CLIs, but every selected CLI must be installed and authenticated on this device.

Ask which agents the user wants. Present the detected results from `dt remote agents` and include available choices such as:

- OpenAI Codex CLI
- Claude Code
- Gemini CLI
- OpenCode
- Kimi CLI
- MiniMax
- Grok CLI
- AGY
- Another CLI named by the user

For every selected agent:

1. Check whether the CLI is installed and show its version.
2. If missing, explain the official installation method and ask before installing it.
3. Start the CLI's official login flow when authentication is required.
4. Never request that the user paste a password, API key, token, cookie, or private credential into chat.
5. Run a safe read-only response test after setup.
6. Run `dt remote agents` and `dt doctor` again.

After the selected agents are ready, ask for:

- The absolute project pathname
- The development task
- The preferred agent or automatic routing
- Whether agents may edit files
- Whether dependency installation is allowed
- Whether commits, pushes, merges, or publishing are allowed

Initialize the workspace policy with `dt remote init`, then use `dt delegate` or other delegate-team routing commands. Independently inspect every resulting diff and rerun all project tests before accepting delegated work.

## Mode 3: Hybrid Mode

In Hybrid Mode:

- Act as the primary coding agent.
- Use Remote Desktop Commander directly for inspection, edits, tests, Git, and browser automation.
- Use delegate-team for isolated specialist tasks when delegation provides clear value.
- Keep final control of the working tree.
- Review all delegated changes and resolve conflicts.
- Run final tests yourself.
- Never rely only on an agent's success message.

## Completion rule

At the end of setup, provide a concise readiness report with:

- Remote Desktop Commander access status
- delegate-team installation status and version
- Detected coding-agent CLIs
- Authentication readiness
- Selected operating mode
- Approved workspace path, when provided
- Current installation, filesystem, Git, and publishing permissions

Then continue with the user's requested coding task.
````
<!-- CHATGPT_REMOTE_BOOTSTRAP_PROMPT_END -->

After setup, initialize a project boundary:

```bash
dt remote init "/absolute/path/to/project"
dt remote status "/absolute/path/to/project"
dt remote doctor "/absolute/path/to/project"
```

You can print the same bootstrap prompt at any time with `dt remote bootstrap`.

---

## ⚡ Pick your lane

| If you want... | Lane | What gets installed | Time |
|---|---|---|---|
| Just the `dt` CLI to dispatch tasks to backends | **[Lane 1 — `dt` CLI](#lane-1--dt-cli-only)** | npm package → `dt` on PATH | 30 s |
| `/apeiron "X"` slash command in Claude Code | **[Lane 2 — `/apeiron`](#lane-2--apeiron-in-claude-code)** | Lane 1 + orchestrator skill | 2 m |
| The full local agent OS (memory, multi-agent, governance) | **[Lane 3 — full local agent OS](#lane-3--full-local-agent-os)** | Lane 2 + MMAS + agent-kernel | 5–10 m |

**Not sure?** Most users start with Lane 1. You can always add Lane 2 / 3
later. Every install is idempotent.

See **[docs/INSTALLATION.md](./docs/INSTALLATION.md)** for the full reference.

---

## Lane 1 — `dt` CLI only

```bash
npm install -g delegate-team
dt --version          # → 3.1.1
dt run "<task>"       # dispatch with auto backend selection
dt run "<task>" --dry-run
dt doctor             # human health check
dt doctor --json      # automation-safe health check
```

**What you get:** one Node CLI. No skills, no hooks, no companion
frameworks, no network calls at runtime unless you dispatch to a configured
backend.

**Uninstall:** `npm uninstall -g delegate-team`

---

## Lane 2 — `/apeiron` in Claude Code

```bash
npm install -g delegate-team                     # Lane 1 first
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --orchestrator                      # install the skill
# Restart Claude Code so /apeiron is registered
```

Then in any Claude Code session:

```bash
/apeiron "Build a CSV → JSON CLI"
apeiron "ship v0.2.0 to npm"           # routing decision only
dt route --explain "<task>"                       # full JSON trace
dt route --last                                   # newest saved trace
```

**What you get:** the `apeiron` skill + `/apeiron` slash command +
`apeiron` CLI on PATH. No MMAS, no agent-kernel.

**Uninstall:** `./install.sh --uninstall`

---

## Lane 3 — full local agent OS

```bash
npm install -g delegate-team                     # Lane 1 first
git clone https://github.com/imMamdouhaboammar/delegate-team
cd delegate-team
./install.sh --all --dry-run                      # preview what changes
./install.sh --all --trust-mode normal --yes      # do it
./install.sh --verify                             # confirm
```

Adds everything from Lane 2 plus:

- **MMAS**: multi-agent team runtime (Atlas + 7 specialists).
- **agent-kernel**: local memory, episodic recall, approval inbox, policy guard.
- **Companion frameworks**: superpowers, Waza, unslop-preflight, autoresearch.

Safety flags worth knowing:

| Flag | What it does |
|---|---|
| `--dry-run` | Show every write + network call without executing |
| `--no-network` | Skip `npx skills add`, `git clone`, `npm install -g` |
| `--trust-mode strict` | Disable MCP auto-load, block external downloads, print every sensitive op |
| `--trust-mode normal` | Default safe behavior |
| `--yes` | Non-interactive setup and install flows |

**Uninstall:** `./install.sh --uninstall`. Your `~/.agent-kernel/` memories
are preserved.

---

## 🚀 Quick demo

```bash
# Lane 1: inspect a task without executing it
dt run "Refactor the user model for multi-tenancy" --dry-run

# Lane 1: dispatch a task
dt run "Refactor the user model for multi-tenancy"

# Lane 2: route a task without executing
dt route --explain "make API p95 < 200ms"
# {"task":"...","detected_signals":{...},"selected_workflow":"PERFORMANCE/METRIC",...}

# Lane 3: spawn a multi-agent team with guardrails
dt mmas spawn "Audit the auth layer" \
    --team atlas,scout,reviewer,sentinel \
    --timeout 900 --max-agents 4
```

---

## 🧩 Component map

| Component | What it does | Lane | Docs |
|---|---|---|---|
| **`dt` CLI** | Dispatch tasks to backends, run the proxy, check health | 1+ | [`DT.md`](./DT.md) |
| **ChatGPT Remote Agent** | Bootstrap ChatGPT Web, enforce a project boundary, and discover local agents | 1+ | [README onboarding](#-turn-chatgpt-web-into-a-local-coding-agent) |
| **`/apeiron` orchestrator** | Natural-language task routing with structured traces | 2+ | [`docs/ROUTING.md`](./docs/ROUTING.md) |
| **agent-kernel** | Local memory + governance (companion) | 3 | [`docs/AGENT-KERNEL-INTEGRATION.md`](./docs/AGENT-KERNEL-INTEGRATION.md) |
| **MMAS** | Multi-agent team runtime with guardrails | 3 | [`docs/MMAS.md`](./docs/MMAS.md) |
| **Skill scaffolder** | `apeiron-skill-scaffold` CLI for new skills | 3 | [`scaffolder/`](./scaffolder/) |
| **Backend agents** | Codex, MiniMax, Gemini, MetaGPT | 3 | [`integrations/`](./integrations/) |
| **delegate-skills** | `dt delegate <agent>` — hand a task to Grok/Codex/OpenCode/Kimi/AGY, review the diff yourself | 3 | [`delegate-skills/SKILL.md`](./delegate-skills/SKILL.md) |

For the conceptual architecture, see **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

---

## 📦 Release and npm publishing

Releases are verified and published directly from a trusted maintainer machine. GitHub Actions does not publish to npm and does not create GitHub Releases.

```bash
npm whoami
npm ci
npm run release:verify
npm run release:publish
```

After npm registry verification, the maintainer pushes the matching Git tag and creates the GitHub Release manually. See **[docs/RELEASING.md](./docs/RELEASING.md)** for the complete procedure and safety rules.

---

## 🛡️ Safety

delegate-team runs AI agents on your local machine under your user account.
It has built-in guards for the common risks:

- Workspace sandboxing (`DT_WORKSPACE_ROOT`)
- Command allowlist (override with `DT_ALLOW_UNSAFE_COMMANDS=true`)
- Supply chain guard (override with `DT_ALLOW_DEP_INSTALL=true`)
- MCP auto-load is **off by default** (`DT_ENABLE_MCP=true` to opt in)
- Proxy local-only bind to `127.0.0.1`
- Proxy auth token check and configurable `DT_PROXY_MAX_BODY`
- MMAS subprocess guardrails (max agents, timeouts, plan-only, kill switch)
- agent-kernel policy guard (pre-commit + Claude `PreToolUse` hooks)

Full threat model + opt-in switches: **[docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md)**.

---

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [docs/INSTALLATION.md](./docs/INSTALLATION.md) | Lane-by-lane install + verify + uninstall |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 5-layer mental model, data flow, boundaries |
| [docs/ROUTING.md](./docs/ROUTING.md) | How the orchestrator picks a verdict |
| [docs/WORKFLOWS.md](./docs/WORKFLOWS.md) | Real examples per verdict |
| [docs/AGENT-KERNEL-INTEGRATION.md](./docs/AGENT-KERNEL-INTEGRATION.md) | Memory + governance boundary contract |
| [docs/MMAS.md](./docs/MMAS.md) | Multi-agent runtime + guardrails |
| [docs/SECURITY-MODEL.md](./docs/SECURITY-MODEL.md) | Threat model + opt-in switches |
| [docs/RELEASING.md](./docs/RELEASING.md) | Local verification, npm publish, tag, and GitHub Release procedure |
| [INSTALL.md](./INSTALL.md) | Granular component-level install detail |
| [DT.md](./DT.md) | Original `dt` CLI specifics |
| [CHANGELOG.md](./CHANGELOG.md) | v1.0.0 → v3.1.1 release notes |
| [SECURITY.md](./SECURITY.md) | Short vulnerability-reporting policy |
| [AGENTS.md](./AGENTS.md) | Repo conventions for contributors |
| [docs/audits/REPO-AUDIT-vNEXT.md](./docs/audits/REPO-AUDIT-vNEXT.md) | Historical audit baseline |

---

## 📊 Project status

| Workflow | Status | Purpose |
|---|---|---|
| CI | [![CI](https://img.shields.io/github/actions/workflow/status/imMamdouhaboammar/delegate-team/ci.yml?label=CI&style=flat-square)](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml) | Build, typecheck, test, routing matrix, manifest validation |

| Backend | Maturity | Notes |
|---|---|---|
| Codex (via `aonios-agent`) | Stable | opencode dispatcher |
| MiniMax (via `mmx`) | Stable | `minimax-coder/` |
| Gemini (via `google-genai`) | Stable | `vertex-coder/` |
| MetaGPT team | Experimental | multi-role team runner |

| Component | Maturity | Notes |
|---|---|---|
| `dt` CLI | Stable | npm package |
| `/apeiron` orchestrator | Stable | bash + Skills.sh skill |
| agent-kernel (vendored v0.0.5) | Stable | companion memory + governance |
| MMAS multi-agent | Beta | runtime + guardrails |

---

## 🤝 Contributing

1. Read **[AGENTS.md](./AGENTS.md)** for repo conventions.
2. Make a feature branch: `git switch -c feat/your-change`.
3. Run CI locally:

   ```bash
   npm ci
   npm run version:check
   npm run typecheck
   npm test
   bash -n install.sh
   bash -n orchestrator/scripts/orchestrate.sh
   python -m py_compile mmas/spawn-team.py mmas/hash-edit.py
   python -m json.tool < .claude-plugin/marketplace.json > /dev/null
   ```

4. Open a PR. CI runs the same checks on GitHub Actions runners.
