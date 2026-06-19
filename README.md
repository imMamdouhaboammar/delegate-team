# ╔╦╗╔═╗╦  ╔═╗╔═╗╔═╗╔╦╗╔═╗  ╔╦╗╔═╗╔═╗╔╦╗
#  ║║║╣ ║  ║╣ ║ ╦╠═╣ ║ ║╣    ║ ║╣ ╠═╣║║║
# ═╩╝╚═╝╩═╝╚═╝╚═╝╩ ╩ ╩ ╚═╝   ╩ ╚═╝╩ ╩╩ ╩
# Unified Developer Agent Dispatch Suite & CLI

`dt` (Delegate Team) is a powerful, lightweight TypeScript CLI tool that acts as a **Policy Gateway and Delegation Runtime**. `dt` can let Claude Code delegate complex tasks to a MetaGPT software team while Claude Code stays in control of review and commit. It allows you to take any coding task, automatically route it to the optimal backend AI agent (or a multi-agent team), execute it directly in your local workspace, and manage **seamless, multi-backend failover** if any agent fails.

---

## 🧠 Nested Agent Orchestration Architecture

Unlike standard tools that just "support MetaGPT", `dt` is built as a **Claude-supervised MetaGPT delegation runtime**. This creates a 4-layer orchestration model:

1. **Claude Code (Controller)**: Writes the technical brief, supervises execution, and holds final commit authority.
2. **`dt` (Policy Gateway)**: Enforces budgets, selects modes, and prevents excessive agency.
3. **MetaGPT (Team Orchestrator)**: Decomposes tasks into specialized roles (Architect, Coder, Reviewer).
4. **Backend Models (Workers)**: e.g., VertexCoder, Codex, MiniMax execute the roles based on capabilities.

**Learn more about our core protocols:**
- 📜 [Delegation Protocol](./DELEGATION_PROTOCOL.md): Strict boundaries, untrusted output handling, and security policies.
- 🔀 [Role Routing](./ROLE_ROUTING.md): How MetaGPT roles are dynamically mapped to specific models via capability tags.
- 🕵️ [Trace Schema](./TRACE_SCHEMA.md): JSON schema to prevent circular delegation, control depth, and avoid cost explosions.

---

## 🎯 The Pain Points & How We Solve Them

Building and executing agentic workflows in production or local environments is highly prone to failures. Here is how `dt` resolves the most frustrating challenges:

| Pain Point | How `dt` Cures It |
|---|---|
| **Fragility & Rate Limits (429s)** <br> Relying on a single AI provider breaks entire developer workflows when quota limits or network outages hit. | **🔄 Best-Effort Failover Ring** <br> `dt` establishes a robust multi-provider ring. If the selected model fails, it sequentially fails over: `vertexcoder` ➡️ `codex` ➡️ `minimax` ➡️ `opencode` ➡️ `gemini` ➡️ `SELF` offering explicit manual fallback if all automated attempts fail. |
| **Skyrocketing Token Costs** <br> Feeding entire repositories into giant LLMs for minor edits wastes millions of input tokens every run. | **⚡ Lean Token Protocol (LEANBRIEF)** <br> Uses a targeted, compact task contract. The routing engine minimizes file ingestion size, which can significantly reduce prompt token usage by only context-feeding relevant files. |
| **Complex Environment Setup** <br> Configuring isolated Python virtualenvs, installing deep SDKs, and managing API keys is a major headache. | **🚀 Autopilot Setup Wizard (`dt setup`)** <br> A fully automated onboarding wizard that handles Python virtual environment creation, pip installs, and cloud provider authentication dynamically. |
| **Security & Hardcoded Credentials** <br> Hardcoding sensitive developer emails or Cloud Project IDs in git history leads to major security leaks. | **🔒 100% Dynamic Authentication Fallbacks** <br> Zero hardcoded keys or emails. `dt` queries active local `gcloud` sessions and stores configurations outside the project directory (`~/.config/dt/config.json`). |
| **Limited Out-of-the-Box Skills** <br> Standard terminal-based coding agents are restricted by their client host tools and lack advanced multi-file capabilities. | **🔗 Skill Linker (`dt link-skill`)** <br> Instantly symlinks the orchestrators directly into local Claude Code and Gemini CLI customization paths as global, high-performance capabilities. |

---

## 🏗️ Repository Structure

```text
.
├── package.json               # Package setup & CLI global mappings
├── src/                       # TypeScript Source Code
│   ├── cli.ts                 # CLI Entry Point
│   ├── commands/              # CLI Commands (run, setup)
│   ├── proxy/                 # LLM Gateway Proxy Server
│   └── ...
├── dist/                      # Compiled JS outputs
├── delegate-team/             # Master coordinator logic (Relay, routers, guidelines)
│   ├── SKILL.md               # Unified orchestrator instructions
│   └── scripts/               # Core routing, relay & fallback systems
├── vertex-coder/              # Premium Vertex AI agent (Python scripts, tools, and virtualenv)
│   ├── SKILL.md               # VertexCoder execution directives
│   ├── vertex_direct_coder.py # Direct single-file coding agent
│   └── vertex_interactive_agent.py # Autonomous multi-file developer loop
├── LICENSE                    # MIT Permissive License
└── README.md                  # Beautiful developer documentation (This file)
```

---

## 🚀 Installation & Setup

### 1. Clone & Link Globally
To install `dt` globally on your workstation:
```bash
# Clone the repository
git clone https://github.com/imMamdouhaboammar/delegate-team.git
cd delegate-team

# Install dependencies and build
npm install
npm run build

# Link the package globally
npm link
```
Now, the `dt` and `delegate-team` commands are available globally in your terminal!

### 2. Run Autopilot Setup
Execute the interactive setup wizard to automatically build the isolated virtual environment, install Python SDKs, and configure cloud project settings:
```bash
dt setup
```

### 3. Register Global Skills
Link the orchestrators as global capabilities for Claude Code and Gemini CLI:
```bash
dt link-skill
```

---

## 💻 CLI Commands & Usage

### 🔍 Failsafe Health Check
Scan configuration, API key, and credential readiness across all 6 backends:
```bash
dt check
```

### 🎯 Smart Multi-Backend Dispatch
Run a task. The OpenCode Complexity Router automatically selects the best backend, executing with active automated failover:
```bash
dt run "Write a pytest suite in test_auth.py checking JWT login boundaries"
```

### ⚡ Direct Vertex AI Coder (Single File)
Modify or create a single file at warp-speed:
```bash
dt vx direct index.html "Update the hero title to a premium dark gradient design"
```

### 🤖 Interactive Vertex AI Agent (Autonomous Multi-File)
Start a full autonomous loop to write code, install packages, run tests, and self-correct:
```bash
dt vx interactive "Implement a complete Express.js backend with modular JWT authorization"
```

### 🏢 MetaGPT AI Software Company (Multi-Agent Workflow)
While `dt run` and `dt vx` are designed for focused engineering tasks and single-backend dispatch, `dt metagpt` spins up an entire AI software company. Use this mode when your task requires a deep, multi-agent workflow (Product Manager -> Architect -> Engineer -> QA).

```bash
# Launch a full AI software company for complex architectures
dt metagpt "Build a complete multiplayer snake game using websockets"
```

Because MetaGPT operates with high autonomy and can generate many files or install dependencies, `dt` provides strict guardrails:
- `--plan-only`: Generate plan and architecture without writing code.
- `--approve-write`: Require human approval before writing to disk.
- `--workspace-only`: Strictly sandbox MetaGPT to the current workspace root.
- `--no-install`: Prevent MetaGPT from installing package dependencies.
- `--dry-run`: Simulate workflow without making destructive changes.


### 🔌 LLM Gateway Proxy
> [!WARNING]
> The proxy server is designed for local development. Do not expose it on a public network without implementing proper authentication and TLS.

Start a highly optimized local LLM Gateway Proxy server on port `3000` (compatible with Cursor / VS Code / IDE integrations):
```bash
dt serve 3000
```

### 🌌 Ultra-Premium UI (LobeChat Integration)
We recommend using **LobeChat** as the ultimate visual interface for `dt`. It provides a stunning, feature-rich web UI while securely using `dt` as its backend orchestrator.

**How to run it via Docker:**
1. Start the `dt` proxy server:
   ```bash
   dt serve 3000
   ```
2. Run the LobeChat Docker container pointing to your local `dt` instance:
   ```bash
   docker run -d -p 3210:3210 \
     -e OPENAI_API_KEY=dt-local \
     -e PROXY_TOKEN=dt-local \
     -e OPENAI_PROXY_URL=http://host.docker.internal:3000/v1 \
     -e ACCESS_CODE= \
     --name lobe-chat \
     lobehub/lobe-chat
   ```
   > **Note:** The `dt` proxy server requires a proxy token. You must pass it via `PROXY_TOKEN=...` or use the generated one in `~/.config/dt/config.json`. The example uses `dt-local` for simplicity, ensure this matches your local setup.
3. Open `http://localhost:3210` in your browser. You now have an ultra-premium UI connected directly to your multi-backend agent dispatcher!

---

## 🤖 Copy for Your Coding Agent

If you are using a coding agent (e.g., Claude Code, Cursor, Gemini CLI) to work in this workspace, copy the block below and paste it directly into its chat window. This instructs the agent to configure and integrate `dt` instantly:

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

---

## 🤝 Contributing

We welcome contributions to expand the orchestration power of `dt`!
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
