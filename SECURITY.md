# Security Policy

## Supported Versions

Currently, the `main` branch (and the latest npm release) is the only supported version for security updates.

## Reporting a Vulnerability

If you discover a security vulnerability within Delegate Team (`dt`), please report it privately. **Do not disclose it publicly** until a patch has been released.
Please open a private security advisory on GitHub or email the maintainers directly.

## Threat Model and Security Features

`dt` is an AI agent orchestration tool that executes code and terminal commands on your local machine. It includes several built-in security features designed to align with OWASP Top 10 for Large Language Model Applications (LLM01-LLM10).

### 1. Workspace File Sandboxing (Mitigates LLM08: Excessive Agency)
By default, the `vertex-coder` agent tools (`read_file`, `write_file`, `list_dir`, `grep_search`, `line_replace`) are strictly bound to the `DT_WORKSPACE_ROOT` (or current working directory).
Access to sensitive paths like `.env`, `~/.ssh`, and `~/.config` is blocked unless explicitly overridden.

### 2. Command Allowlisting (Mitigates OS Command Injection & LLM08)
The `run_command` tool enforces a strict allowlist of safe commands (e.g., `npm test`, `git status`).
Destructive operations (e.g., `rm -rf /`) are hard-blocked. Unsafe or unlisted commands require explicit human approval via setting the `DT_ALLOW_UNSAFE_COMMANDS=true` environment variable; the model cannot bypass this independently.

### 3. Supply Chain Protection (Mitigates LLM05: Supply Chain Vulnerabilities)
The `add_dependency` tool blocks direct tarball/zip installations, local path references (e.g. `../pkg`), editable installs, and forces `--ignore-scripts` during npm installs. Furthermore, installing packages requires explicit human approval via the `DT_ALLOW_DEP_INSTALL=true` environment variable.

### 4. Untrusted Skills Protection (Mitigates LLM01: Prompt Injection)
Global skills (`SKILL.md`) loaded from external directories are treated as untrusted. They cannot be injected as system instructions or directly into the agent's context without a strict allowlist or an explicit `approve_untrusted` flag.

### 5. Proxy Server Hardening (Mitigates LLM04, Secrets Management)
The local LLM gateway proxy (`dt serve`) is secured by:
- Binding to `127.0.0.1` and requiring a proxy token.
- Strict CORS policies allowing only explicit localhost UI ports.
- 2MB request body size limits to prevent local DoS.
- Automatic log redaction for API keys and Bearer tokens in error outputs.

### 6. MCP Process Security (Mitigates LLM07: Insecure Plugin Design)
MCP (Model Context Protocol) servers define external tools and resources. By default, `dt` blocks the auto-loading of MCP servers defined in the `mcp_config.json` to prevent malicious config files from triggering arbitrary remote code execution via `subprocess.Popen`. Users must explicitly opt-in by setting `DT_ENABLE_MCP=true`.

### 7. Dynamic Authentication
`dt` avoids hardcoded keys in `.env` files by using dynamic CLI authentication (e.g., `gcloud auth print-access-token`) where possible and caching config globally in `~/.config/dt/config.json`.
