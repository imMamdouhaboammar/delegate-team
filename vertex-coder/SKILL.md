---
name: vertex-coder
description: Use Google Vertex AI high-end coding models (Gemini 3.5 Flash and Gemini 3.1 Pro) directly on local files. Bypasses standard LLM token limits and bills to GCP. Supports direct coding and fully autonomous interactive agent loops.
---

# Vertex AI Coding Agent & Direct Coder Skill

This skill allows any agent (e.g. Claude Code, Codex, Antigravity, or other local AI models) to delegate heavy code generation, debugging, testing, and multi-file editing tasks to premium Google Vertex AI models (**`gemini-3.1-pro-custom-tools`**, **`gemini-3.1-pro`**, or **`gemini-3.5-flash`**) on behalf of the user, executing directly on your macOS.

It features two distinct modes of execution:
1. **Direct Coder Mode (`vertex_direct_coder.py`)**: High-speed, single-file generation/modification.
2. **Interactive Agent Mode (`vertex_interactive_agent.py`)**: A fully autonomous, multi-step ReAct tool-use loop that can explore the directory, read files, write multiple files, run bash commands, catch test failures, and auto-correct itself until completion.

---

## Benefits

- **Token Saving**: Bypasses the local agent's session context and token limits by executing heavy generation loops directly on your GCP billing project.
- **Superior Quality**: Accesses Google's premium-tier Gemini models (e.g., Gemini 3.1 Pro for supreme coding/reasoning, Gemini 3.5 Flash for high speed).
- **Fully Autonomous**: Interactive mode can run tests, detect bugs, modify code, and verify fixes completely on its own.

---

## Requirements & Setup

Before invoking this tool, ensure the following are available on your system:
1. **Google Cloud CLI (`gcloud`)** must be installed and authenticated:
   ```bash
   gcloud auth application-default login
   ```
2. **Active GCP Project**: The target project is `fair-geography-494614-q0` (active billing).
3. **Environment**: The scripts are tied to the Python environment containing `google-genai` and `google-oauth2`:
   Interpreter: `/Users/mamdouhaboammar/Documents/antigravity/fervent-maxwell/.venv/bin/python3`

---

## Global Usage Syntax for AI Agents

---

### MODE A: Direct Coder Mode (Single File / High Speed)
Use this when you want to quickly generate or modify a specific single file.

#### Syntax:
```bash
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_direct_coder.py <file_path> "<prompt_or_instruction>" [model_name]
```

#### Supported Models:
- `gemini-3.1-pro-custom-tools` (Rank 1 Default: Specialized variant of Gemini 3.1 Pro heavily optimized for mixing bash executions with defined custom tool calling)
- `gemini-3.1-pro` (Ultimate reasoning, maximum coding capabilities, default fallback)
- `gemini-3.5-flash` (High speed, outstanding coding, default for fast tasks)

#### Examples:
```bash
# Create a new flask app file with gemini-3.5-flash
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_direct_coder.py app.py "Create a modular flask application with routes for a user dashboard" gemini-3.5-flash

# Modify an existing file with gemini-3.1-pro
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_direct_coder.py app.py "Add JWT-based user authentication and error-handling middleware" gemini-3.1-pro
```

---

### MODE B: Interactive Agent Mode (Autonomous Multi-File / Debugging)
Use this when the task requires exploring the workspace, designing a complete feature, running tests (e.g., pytest), catching failures, and editing multiple files iteratively until everything works.

#### Master Tools Registry & Connected Services
The interactive agent is equipped with robust, premium local workspace tools:
- **`line_replace`** [PREFERRED]: Finds and replaces specific content in a file using explicit 1-indexed line numbers. Supports ellipsis `...` line matching for large blocks, dramatically minimizing code rewrite size and latency.
- **`add_dependency`**: Safely adds npm (Node.js) or pip (Python) packages to your project automatically with auto-detection.
- **`save_memory` & `read_memories`**: Stores and retrieves custom architectural rules, preferences, tech stacks, or project context inside a local persistent `.agent_memory.json` file.
- **`grep_search`**: Powerful regular expression search (utilizing Python's compiled `re` engine) to scan the codebase efficiently.
- **`list_dir`**: Lists files and subdirectories.
- **`read_file`**: Reads entire contents of any file.
- **`write_file`**: Creates new files or overwrites existing ones (mainly for new file creation).
- **`run_command`**: Runs terminal/bash commands locally to test, run servers, or build codebases (60-second timeout).
- **`list_global_skills`** & **`use_global_skill`**: Allows Vertex Coder to dynamically query and execute sub-agents using any available global agent skills on your system.
- **`load_superpower_skill`**: Dynamically loads a global skill's full instructions (SKILL.md) directly into the agent's current context, allowing it to follow its methodologies (e.g. `test-driven-development`, `doubt-driven-development`, `graphify`, `security-and-hardening`) natively while retaining full local file and CLI access.

---

### Elite Systems Prompts & Secret Sauces (Lovable & Industry-Leading Strategy)
The Interactive Agent utilizes advanced, highly optimized systems instructions inspired by leading coding tools (Claude Code, Windsurf, Devin, v0):
1. **Strict Response Conciseness**: Non-tool conversational responses are capped strictly under 4 lines of text. No chatty preambles or polite fillers.
2. **Persistent Local Memory**: Programmatic lookup of `.agent_memory.json` on startup to seamlessly inject design parameters, user preferences, and technology constraints into the active session without requiring manual tool invocations.
3. **Proactive Verification**: Authorized to proactively run local test suites (e.g., `pytest`, `vitest`), builders, or linters immediately after code changes to confirm correctness before finalizing.
4. **Dependency-First Pipeline**: Mandates installing third-party dependencies via `add_dependency` before writing any files importing them.
5. **Deep Codebase Inspection**: Instructed to read library specs directly from `node_modules` or local packages if documentation or types are lacking.
6. **Precise Reference Style**: References code and locations using `path/file.ext:line_number` format for direct navigation.
7. **Systematic Reasoning Gates**: Summarizes goals and outlines plans prior to committing wide-scale changes.
8. **SEO Best Practices**: Standard meta tag structures, semantic HTML tags, H1 checks, mobile responsiveness, and clean URLs are automatically and transparently enforced on all frontend work.

---

### ⚡ Native Expert Skills & Superpowers Integration

The interactive agent natively integrates Jesse Vincent's **Superpowers** and other expert software engineering guidelines (such as `test-driven-development`, `spec-driven-development`, `doubt-driven-development`, `security-and-hardening`, `code-review-and-quality`, and `graphify` codebase analysis).

These guidelines can be loaded in two ways:
1. **Preloaded**: Passed at session startup using the `-s` / `--skills` argument.
2. **Dynamically Loaded**: Loaded on-the-fly inside the chat session by the agent calling the `load_superpower_skill(skill_name)` tool.

---

#### Syntax:
```bash
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_interactive_agent.py "<complex_task_prompt>" [model_name] [--skills skill1 skill2 ...]
```

#### Examples:
```bash
# Create a math library using TDD (Test-Driven Development) and verify with pytest
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_interactive_agent.py "Create a simple matrix multiplication function in matrix_mul.py" gemini-3.5-flash --skills test-driven-development

# Execute a complex feature with robust clean-code reviews and planning files
/Users/mamdouhaboammar/.gemini/config/skills/vertex-coder/scripts/vertex_interactive_agent.py "Add JWT auth and validation to our API" gemini-3.1-pro-custom-tools --skills planning-and-task-breakdown security-and-hardening code-review-and-quality
```

*(Note: If you omit the second parameter, it defaults to `gemini-3.1-pro-custom-tools` for ultimate agentic reasoning and custom tool execution).*

