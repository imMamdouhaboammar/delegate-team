# ╔╦╗╔═╗╦  ╔═╗╔═╗╔═╗╔╦╗╔═╗  ╔╦╗╔═╗╔═╗╔╦╗
#  ║║║╣ ║  ║╣ ║ ╦╠═╣ ║ ║╣    ║ ║╣ ╠═╣║║║
# ═╩╝╚═╝╩═╝╚═╝╚═╝╩ ╩ ╩ ╚═╝   ╩ ╚═╝╩ ╩╩ ╩
# Unified Developer Agent Dispatch Suite & CLI

Every great developer reaches a breaking point with AI coding tools. 

You hand a complex task to your favorite AI agent. It starts strong, but then hits a rate limit and crashes. You retry, but this time it ingests your entire repository, burning millions of tokens for a three-line fix. Or worse, you spend hours fighting Python virtual environments and API keys just to get a multi-agent framework running. 

The promise of AI engineering is automation, but the reality is often fragile, expensive, and chaotic.

**Enter `dt` (Delegate Team).**

`dt` isn't just another AI wrapper. It is a powerful, lightweight TypeScript CLI designed as a **Policy Gateway and Delegation Runtime**. Imagine having a seasoned engineering manager that sits between you (or your primary AI assistant like Claude Code) and a team of specialized AI agents. `dt` routes the task, enforces budgets, handles failovers gracefully, and ensures your environment is perfectly configured—all while keeping you in total control.

---

## 📖 The Story of the 4-Layer Architecture

Unlike standard tools that just "support MetaGPT" or fire prompts at an API, `dt` introduces a **Claude-supervised delegation runtime**. Think of it as a corporate hierarchy for AI:

1. **The Controller (Claude Code / You)**: Writes the technical brief, supervises the overall execution, and holds final commit authority.
2. **The Policy Gateway (`dt`)**: Enforces token budgets, selects operational modes, and prevents excessive agency. It's the shield protecting your codebase.
3. **The Team Orchestrator (MetaGPT)**: Breaks down the monolithic task into specialized roles—Architect, Coder, Reviewer.
4. **The Workers (Backend Models)**: VertexCoder, Codex, MiniMax, Gemini, and OpenCode execute their specific roles based on their unique capabilities.

**Dive deeper into our core lore:**
- 📜 [Delegation Protocol](./DELEGATION_PROTOCOL.md): Strict boundaries, untrusted output handling, and security policies.
- 🔀 [Role Routing](./ROLE_ROUTING.md): How MetaGPT roles are dynamically mapped to specific models via capability tags.
- 🕵️ [Trace Schema](./TRACE_SCHEMA.md): JSON schema to prevent circular delegation, control depth, and avoid cost explosions.

---

## 🐉 Slaying the Dragons of AI Engineering (Features)

Building and executing agentic workflows locally is fraught with peril. Here is how `dt` slays the most common dragons:

| The Threat | The `dt` Weapon |
|---|---|
| **The 429 Dragon (Rate Limits & Outages)** <br> Relying on a single provider breaks your workflow when APIs go down. | **🔄 Best-Effort Failover Ring** <br> `dt` forms an unbreakable shield. If a model fails, it sequentially routes the task: `vertexcoder` ➡️ `codex` ➡️ `minimax` ➡️ `opencode` ➡️ `gemini` ➡️ `SELF`. You never stop coding. |
| **The Token Glutton (Skyrocketing Costs)** <br> Ingesting irrelevant files wastes millions of tokens. | **⚡ Lean Token Protocol (LEANBRIEF)** <br> A targeted, compact contract. The routing engine minimizes file ingestion size, feeding only the context that actually matters. |
| **The Environment Labyrinth (Setup Nightmares)** <br> Virtualenvs, SDKs, and deep dependencies are a headache. | **🚀 Autopilot Setup Wizard (`dt setup`)** <br> A fully automated onboarding wizard that magically creates isolated virtual environments, installs PIP packages, and dynamically configures cloud authentication. |
| **The Security Breach (Hardcoded Keys)** <br> Leaving keys or developer emails in Git history is fatal. | **🔒 100% Dynamic Authentication Fallbacks** <br> Zero hardcoded keys. `dt` queries your active local `gcloud` sessions and safely stores configurations in `~/.config/dt/config.json`. |
| **The Sandbox Trap (Limited Skills)** <br> Standard terminal agents are trapped and lack multi-file power. | **🔗 Skill Linker (`dt link-skill`)** <br> Instantly injects `dt`'s orchestrators directly into local Claude Code and Gemini CLI paths as high-performance global capabilities. |

---

## 🏰 The Citadel Structure (Repository)

Your command center is organized for maximum efficiency:

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

## ⚔️ Arming Yourself (Installation & Setup)

Ready to take command? Here is how to forge your tools.

### 1. Clone & Link Globally
Install `dt` globally on your workstation to summon it from any directory:
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
*The `dt` command is now bound to your terminal!*

### 2. Run Autopilot Setup
Don't waste time configuring Python. Let the wizard build your isolated virtual environments and align your cloud credentials:
```bash
dt setup
```

### 3. Register Global Skills
Empower your existing AI assistants (like Claude Code and Gemini CLI) with `dt`'s full arsenal:
```bash
dt link-skill
```

---

## 📜 The Spellbook (CLI Commands & Usage)

### 🔍 Failsafe Health Check
Ensure your armor is intact. Scan configurations, API keys, and credential readiness across all 6 backends:
```bash
dt check
```

### 🎯 Smart Multi-Backend Dispatch
Cast a complex task. The OpenCode Complexity Router analyzes it and selects the optimal backend, complete with automated failover:
```bash
dt run "Write a pytest suite in test_auth.py checking JWT login boundaries"
```

### ⚡ Direct Vertex AI Coder (Single File)
Strike with precision. Modify or create a single file at warp-speed:
```bash
dt vx direct index.html "Update the hero title to a premium dark gradient design"
```

### 🤖 Interactive Vertex AI Agent (Autonomous Multi-File)
Summon an autonomous entity. Let it write code, install packages, run tests, and self-correct over multiple files:
```bash
dt vx interactive "Implement a complete Express.js backend with modular JWT authorization"
```

### 🏢 MetaGPT AI Software Company (Multi-Agent Workflow)

> [!NOTE]
> **Status:** `dt` is building a Claude-supervised MetaGPT delegation runtime. Current MetaGPT support launches a policy-aware adapter and role map. Full per-role backend execution is under active development.

When the task is monumental, summon an entire company. While `dt run` focuses on execution, `dt metagpt` spins up an Architect, Product Manager, Engineer, and QA.
```bash
# Launch a full AI software company for complex architectures
dt metagpt "Build a complete multiplayer snake game using websockets"
```

**Guardrails for the Automata:**
Because a full company acts with high autonomy, `dt` provides strict magical barriers:
- `--plan-only`: Draft the architecture without writing code.
- `--approve-write`: Require your final human seal of approval before writing to disk.
- `--workspace-only`: Sandbox the team strictly to the current workspace root.
- `--no-install`: Forbid the installation of package dependencies.
- `--dry-run`: Simulate the entire workflow safely.

---

## 🔮 The Portal (LLM Gateway Proxy)

> [!WARNING]
> The proxy server is a portal designed strictly for local development. Do not expose it to the wild public network without implementing proper authentication and TLS.

Start a highly optimized local LLM Gateway Proxy server on port `3000` to connect tools like Cursor or VS Code directly to `dt`:
```bash
dt serve 3000
```

### 🌌 Ultra-Premium UI (LobeChat Integration)
For the ultimate visual experience, pair `dt` with **LobeChat**. It acts as a stunning command bridge while `dt` powers the backend.

**To open the portal via Docker:**
1. Ignite the `dt` proxy server:
   ```bash
   dt serve 3000
   ```
2. Launch the LobeChat Docker container, pointing its API URL to your local `dt` instance:
   ```bash
   docker run -d -p 3210:3210 \
     -e OPENAI_API_KEY=dt-local \
     -e PROXY_TOKEN=dt-local \
     -e OPENAI_PROXY_URL=http://host.docker.internal:3000/v1 \
     -e ACCESS_CODE= \
     --name lobe-chat \
     lobehub/lobe-chat
   ```
   > **Note:** The `dt` proxy server requires the token from `~/.config/dt/config.json`. We use `dt-local` in this example for simplicity.
3. Journey to `http://localhost:3210` in your browser. You now command a multi-backend agent dispatcher through an ultra-premium interface.

---

## 🤝 Summoning Your Agent (Prompt Injection)

If you use Claude Code, Cursor, or Gemini CLI, you can inject `dt`'s knowledge directly into their minds. Copy this incantation and paste it into your agent's chat window:

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

## 🏕️ Join the Fellowship (Contributing)

We welcome fellow developers to expand the orchestration power of `dt`!
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/EpicEnhancement`).
3. Commit your Changes (`git commit -m 'Add an EpicEnhancement'`).
4. Push to the Branch (`git push origin feature/EpicEnhancement`).
5. Open a Pull Request.

---

## 📜 The Covenant (License)

Distributed under the MIT License. See `LICENSE` for more information. Let's build the future, together.
