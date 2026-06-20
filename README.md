# Delegate Team (`dt`)

![CI](https://github.com/imMamdouhaboammar/delegate-team/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)

`dt` is a local CLI that lets Claude Code delegate coding tasks to specialized agent backends.

It can route a task to VertexCoder, Codex, MiniMax, OpenCode, Gemini, or a MetaGPT-style team workflow, while keeping Claude Code or the human as the final reviewer.

The promise of AI engineering is automation, but the reality is often fragile, expensive, and chaotic. You hand a complex task to an AI agent, it hits a rate limit, or ingests irrelevant files burning millions of tokens. `dt` solves this by acting as a Policy Gateway and Delegation Runtime.

## What `dt` is

- A local delegation gateway for AI coding agents
- A routing layer between Claude Code and multiple coding backends
- A policy layer for budgets, workspace boundaries, failover, and review
- A MetaGPT-style team runner for complex tasks

## What `dt` is not

- It is not a replacement for Claude Code
- It does not commit code automatically
- It does not guarantee every backend is available
- It does not make untrusted agent output safe without review

## Core Features

| Feature | Description |
|---|---|
| **Failover Ring** | `dt` attempts best-effort fallback across configured backends. If another backend is available, `dt` can retry the task automatically. |
| **Lean Token Protocol** | A targeted, compact contract. The routing engine minimizes file ingestion size, feeding only the context that actually matters. |
| **Autopilot Setup** | `dt setup` creates local Python virtual environments and checks cloud credentials. |
| **Dynamic Auth** | Zero hardcoded keys. `dt` queries your active local sessions and safely stores configurations locally. |
| **Skill Linker** | Instantly injects `dt`'s orchestrators directly into local Claude Code and Gemini CLI paths. |

## Architecture

Unlike standard tools that just "support MetaGPT" or fire prompts at an API, `dt` introduces a **supervised delegation runtime**:

```text
User
  ↓
Claude Code
  ↓ brief / review
dt Policy Gateway
  ↓ route
Single backend OR Team mode
  ↓
VertexCoder / Codex / MiniMax / OpenCode / Gemini
  ↓
result contract
  ↓
Claude Code review
  ↓
human-approved commit
```

- 📜 [Delegation Protocol](./DELEGATION_PROTOCOL.md): Strict boundaries, untrusted output handling, and security policies.
- 🔀 [Role Routing](./ROLE_ROUTING.md): How MetaGPT roles are dynamically mapped to specific models via capability tags.
- 🕵️ [Trace Schema](./TRACE_SCHEMA.md): JSON schema to prevent circular delegation, control depth, and avoid cost explosions.

## Requirements

- Node.js 18+
- npm
- Python 3.10+
- Optional: gcloud CLI for VertexCoder
- Optional: provider credentials for configured backends

## Quick start

```bash
# Clone the repository
git clone https://github.com/imMamdouhaboammar/delegate-team.git
cd delegate-team

# Install dependencies and build
npm install
npm run build

# Link the package globally
npm link

# Verify installation
dt --help
dt check
```

## Full setup

```bash
# Run the autopilot setup to build Python environments and configure cloud dependencies
dt setup

# Check backend readiness
dt check --strict

# Link dt skills to local agents
dt link-skill
```

> **Warning:** `dt link-skill` creates or updates local skill links in your agent tool directories. Review the target paths before using it on a shared workstation.

## Commands

### Which command should I use?

| Use case | Command |
|---|---|
| Small focused fix | `dt run "fix the auth bug"` |
| Force one backend | `dt run "..." --backend vertexcoder` |
| Large multi-module task | `dt run "..." --team` |
| Direct team workflow | `dt metagpt "..." --workspace-only --no-install` |
| Check setup | `dt check --strict` |

### Smart Multi-Backend Dispatch
Cast a complex task. The routing analyzes it and selects the optimal backend, complete with automated failover.
```bash
dt run "Write a pytest suite in test_auth.py checking JWT login boundaries"
```

### Direct Vertex AI Coder (Single File)
Modify or create a single file:
```bash
dt vx direct index.html "Update the hero title to a premium dark gradient design"
```

### Interactive Vertex AI Agent (Autonomous Multi-File)
Summon an autonomous entity to write code, install packages, run tests, and self-correct over multiple files:
```bash
dt vx interactive "Implement a complete Express.js backend with modular JWT authorization"
```

## Backend readiness

Run:

```bash
dt check --strict
```

Backends may show:
- ready
- missing credentials
- missing binary
- not configured

## Security model

- `dt` is local-first
- Agent output is treated as untrusted until reviewed
- Claude Code or the human keeps final commit authority
- File tools are restricted to the workspace
- Dependency installation is blocked unless explicitly enabled
- The local proxy binds to `127.0.0.1` and requires a token
- Do not expose `dt serve` to a public network

For more details, see [SECURITY.md](./SECURITY.md).

## Team mode

> **Status:** `dt` currently provides a MetaGPT-style team adapter. It runs specialized roles through `dt` backends, such as architect, coder, UI implementer, and reviewer. This is not yet a full upstream MetaGPT integration. It is a controlled `dt` team runtime inspired by MetaGPT-style role orchestration.

When the task is monumental, summon an entire company. While `dt run` focuses on execution, `dt metagpt` spins up an Architect, Product Manager, Engineer, and QA.
```bash
dt metagpt "Build a complete multiplayer snake game using websockets"
```

Because a full company acts with high autonomy, `dt` provides strict barriers:
- `--plan-only`: Draft the architecture without writing code.
- `--approve-write`: Require your final human seal of approval before writing to disk.
- `--workspace-only`: Sandbox the team strictly to the current workspace root.
- `--no-install`: Forbid the installation of package dependencies.
- `--dry-run`: Simulate the entire workflow safely.

## Local proxy

Start a local LLM Gateway Proxy server on port `3000` to connect tools directly to `dt`:
```bash
dt serve 3000
```

### Optional LobeChat integration
You can connect LobeChat to the local `dt` proxy for a browser-based chat interface.

1. Start the `dt` proxy server:
   ```bash
   dt serve 3000
   ```
2. Open `~/.config/dt/config.json`, copy `proxy_token`, and use it as `OPENAI_API_KEY`.
3. Launch the LobeChat Docker container, pointing its API URL to your local `dt` instance:
   ```bash
   docker run -d -p 3210:3210 \
     -e OPENAI_API_KEY="<your-dt-proxy-token>" \
     -e PROXY_TOKEN="<your-dt-proxy-token>" \
     -e OPENAI_PROXY_URL=http://host.docker.internal:3000/v1 \
     -e ACCESS_CODE= \
     --name lobe-chat \
     lobehub/lobe-chat
   ```
4. Journey to `http://localhost:3210` in your browser.

## Claude Code / Agent Setup Prompt

If you use Claude Code, Cursor, or Gemini CLI, you can inject `dt`'s knowledge directly into their minds. Copy this prompt and paste it into your agent's chat window:

```text
=================== COPY FOR YOUR AGENT ===================
SYSTEM DIRECTIVE: You are an agentic developer assistant. We have integrated the "Delegate Team (dt)" orchestration suite. Please execute the following tasks to align your local environment, but ALWAYS ask for user approval before running commands:
1. Verify the repository is cloned and linked globally. If not, ask the user if you should run:
   npm install && npm run build && npm link
2. Ask the user for permission to trigger the Autopilot Onboarding Wizard to build python environments and verify cloud dependencies using:
   dt setup
3. Ask the user for permission to automatically register the orchestrators as global capabilities on this workstation using:
   dt link-skill
4. Run a system scan to verify all 6 backends are green:
   dt check
5. Guide the user on selecting complex multi-file tasks and orchestrating them via:
   dt run "your-prompt"
===========================================================
```

## Repository structure

```text
.
├── package.json               # Package setup & CLI global mappings
├── src/                       # TypeScript Source Code
│   ├── cli.ts                 # CLI Entry Point
│   ├── commands/              # CLI Commands (run, setup)
│   ├── proxy/                 # LLM Gateway Proxy Server
│   └── ...
├── dist/                      # Generated after npm run build, not committed
├── delegate-team/             # Master coordinator logic (Relay, routers, guidelines)
│   ├── SKILL.md               # Unified orchestrator instructions
│   └── scripts/               # Core routing, relay & fallback systems
├── vertex-coder/              # Python agent code. Local .venv is created by dt setup
│   ├── SKILL.md               # VertexCoder execution directives
│   ├── vertex_direct_coder.py # Direct single-file coding agent
│   └── vertex_interactive_agent.py # Autonomous multi-file developer loop
├── LICENSE                    # MIT Permissive License
└── README.md                  # Developer documentation
```

## Current limitations

- Team mode is MetaGPT-style, not a full upstream MetaGPT runtime
- Some backends require local tools or credentials
- Team artifacts are still evolving
- Human approval queue is planned but not fully implemented
- Security controls are local policy gates, not a sandboxed VM

## Roadmap

- Real team artifact handoff between roles
- Human approval queue
- Stronger role-to-backend contracts
- More security regression tests
- npm package release
- Optional upstream MetaGPT compatibility

## Contributing

We welcome fellow developers to expand the orchestration power of `dt`!

Before opening a PR:
```bash
npm run typecheck
npm run build
npm test
dt check
```

Security-sensitive changes should include tests for:
- workspace boundary
- command allowlist
- proxy auth
- dependency install gates

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/EpicEnhancement`).
3. Commit your Changes (`git commit -m 'Add an EpicEnhancement'`).
4. Push to the Branch (`git push origin feature/EpicEnhancement`).
5. Open a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` for more information.
