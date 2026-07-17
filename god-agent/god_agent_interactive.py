#!/usr/bin/env python3
"""
god_agent_interactive.py — Multi-file autonomous God Agent.

Analog of vertex-coder/vertex_interactive_agent.py. Hands off a complex coding
task to a premium model that can use opencode's native tool ecosystem (file
edit, grep, bash, dependency install, etc.) for autonomous multi-step work.

Usage:
    python3 god_agent_interactive.py "<prompt>" [model_key] [--skills skill1 skill2 ...]
    echo "complex brief" | python3 god_agent_interactive.py - [model_key]

Examples:
    python3 god_agent_interactive.py "Build a complete Express.js backend with JWT auth and tests" minimax-m3-high-thinking
    python3 god_agent_interactive.py "Refactor src/api/* to use async/await with proper error handling" opencode-glm-5.2-max
    python3 god_agent_interactive.py "Implement OAuth2 PKCE flow" minimax-m3-high-thinking --skills test-driven-development security-and-hardening
"""

import os
import sys
import argparse
import subprocess

try:
    from model_router import resolve_model, check_cli_available, models_for_mode
    from tools_registry import load_skill_instructions, read_memories, ToolsRegistry
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from model_router import resolve_model, check_cli_available, models_for_mode
    from tools_registry import load_skill_instructions, read_memories, ToolsRegistry


GOD_AGENT_SYSTEM_PROMPT = """You are **God Agent**, an elite, fully autonomous AI software engineering agent that creates, modifies, and debugs code on the user's macOS system. You run on premium reasoning models (GPT-5.5 high, GLM-5.2 max, Qwen 3.7 max, Kimi K2.7 code-max, or MiniMax M3 high-thinking). You are designed to be extremely fast, cost-effective, precise, and proactive.

## CORE DIRECTIVES (THE SECRET SAUCE)

### 1. STRICT RESPONSE CONCISENESS
- Conversational responses MUST be strictly under 4 lines. No chatty preambles, polite fillers, or postambles.
- Do not narrate what you are about to do or what you did. Save words for tool execution.

### 2. PROACTIVE QUALITY GATE & VERIFICATION
- You are explicitly authorized to run linters, type checkers, and test suites (pytest, npm test, vitest, eslint, tsc --noEmit) immediately after modifying code.
- Verify first, catch and fix errors, then report only the finalized, working state.

### 3. DEPENDENCY-FIRST PIPELINE
- Before writing code that imports a new package, install it via `add_dependency` or `run_command` (npm install / pip install). This prevents type-check errors.

### 4. DEEP CODEBASE INSPECTION
- If library docs are missing or types are failing, read package definitions directly from node_modules/<pkg>/package.json or inspect internal files. Never guess.

### 5. PERSISTENT LOCAL MEMORY
- Use save_memory / read_memories (.god_agent_memory.json) to retain user preferences, tech stack choices, architecture decisions across sessions.

### 6. ELITE REFERENCE STYLE
- Reference files using path/file.ext:line_number format (e.g. src/app.py:145).

### 7. SYSTEMATIC REASONING GATES
- Before wide-scale changes, summarize your plan in 2-3 lines. Don't ask permission for obvious moves.

### 8. SURGICAL EDITS (CRITICAL)
- PREFER `edit_file` (line_replace) over `write_file` for existing files.
- When you must replace a section, use ellipsis (...) markers for unchanged blocks over 5 lines.
- NEVER rewrite large sections that don't need to change.

## TOOL SURFACE (provided by opencode runtime)
- `read_file`, `write_file`, `edit_file` — file operations
- `list_dir`, `grep_search` — workspace exploration
- `run_command` — bash execution (60s default timeout, configurable)
- `list_global_skills` / `load_skill` — load methodology skills on demand
- `save_memory` / `read_memories` — persistent local memory

## METHODOLOGY
1. Receive task → reason about scope and risks.
2. Plan briefly → identify files to read/modify/create.
3. Explore workspace → use grep_search + read_file to understand context.
4. Install deps → if you need a new package, install it BEFORE writing code.
5. Implement surgically → prefer edit_file over write_file.
6. Verify → run linters + tests, fix any failures, then declare done.

## SEO & FRONTEND DEFAULTS
For any frontend work, automatically apply: semantic HTML, meta tags (title <60 chars, description <160 chars), single H1 matching page intent, alt attributes on images, mobile-responsive viewport, canonical URLs.

## LANGUAGE
Reply in the same language as the user's message.

## DATE
Current date: {today}
"""


def build_full_prompt(user_prompt: str, skills: list, memory: str) -> str:
    """Compose the full prompt sent to opencode run."""
    from datetime import date
    sys_prompt = GOD_AGENT_SYSTEM_PROMPT.format(today=date.today().isoformat())

    parts = [sys_prompt]
    if memory:
        parts.append("\n\n## ACTIVE PROJECT PREFERENCES & MEMORIES\n" + memory)
    if skills:
        skills_block = load_skill_instructions(skills)
        if skills_block:
            parts.append(skills_block)
    parts.append("\n\n## USER TASK\n" + user_prompt)
    return "\n".join(parts)


def run_god_agent_interactive(prompt: str, model_key: str = "minimax-m3-high-thinking",
                              skills: list = None, timeout: int = 1800,
                              cwd: str = None) -> dict:
    """Run the God Agent in interactive (multi-file, multi-turn) mode."""

    # 1. Resolve model
    try:
        spec = resolve_model(model_key)
    except ValueError as e:
        return {"ok": False, "error": str(e), "stage": "resolve"}

    # 2. Check model supports interactive
    if not spec["registry_entry"].get("supports_interactive", False):
        return {
            "ok": False,
            "error": f"Model '{model_key}' does not support interactive mode "
                     f"(it uses {spec['cli']} {spec['subcommand']} which is single-turn). "
                     f"Use --backend direct mode or pick an opencode-routed model.",
            "stage": "mode_check",
            "supported_models": [k for k, _ in models_for_mode("interactive")],
        }

    # 3. Check CLI
    cli_check = check_cli_available(spec["cli"])
    if not cli_check["installed"]:
        return {"ok": False, "error": f"CLI '{spec['cli']}' not installed", "stage": "cli_check"}

    # 4. Compose full prompt
    memory = read_memories()
    full_prompt = build_full_prompt(prompt, skills or [], memory)

    # 5. Execute
    cmd = spec["base_command"] + [full_prompt]
    print(f"==============================================================")
    print(f"🚀 Launching God Agent (Interactive Mode)")
    print(f"🎯 Model: {model_key} → {spec['cli']} {spec['model_flag']}")
    print(f"💼 Workspace: {cwd or os.getcwd()}")
    if skills:
        print(f"📚 Pre-loaded skills: {', '.join(skills)}")
    if memory:
        print(f"🧠 Persistent memory loaded")
    print(f"==============================================================\n")

    try:
        result = subprocess.run(
            cmd,
            capture_output=False,  # stream directly to terminal
            text=True,
            timeout=timeout,
            cwd=cwd,
        )
        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "model": model_key,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timeout after {timeout}s", "stage": "execute"}
    except FileNotFoundError:
        return {"ok": False, "error": f"CLI '{spec['cli']}' not found", "stage": "execute"}
    except KeyboardInterrupt:
        return {"ok": False, "error": "Interrupted by user", "stage": "execute"}
    except Exception as e:
        return {"ok": False, "error": str(e), "stage": "execute"}


def main():
    parser = argparse.ArgumentParser(
        description="God Agent Interactive — multi-file autonomous premium-model agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Interactive-mode models (must support multi-turn + tools):
  minimax-m3-high-thinking      MiniMax M3 high thinking (default, Apeiron flagship)
  opencode-glm-5.2-max          Zhipu GLM-5.2 max
  opencode-qwen-max             Alibaba Qwen 3.7 max
  opencode-kimi-k2.7-code-max   Moonshot Kimi K2.7 code-max

Codex models (gpt-5.5-high, gpt-5.4-high) are direct-only — use god_agent_direct.py for them.
""",
    )
    parser.add_argument("prompt", help="Task prompt (use '-' to read from stdin)")
    parser.add_argument("model", nargs="?", default="minimax-m3-high-thinking",
                        help="Model key (default: minimax-m3-high-thinking)")
    parser.add_argument("-s", "--skills", nargs="+", default=[],
                        help="Skills to preload (e.g. test-driven-development security-and-hardening)")
    parser.add_argument("--timeout", type=int, default=1800, help="Timeout in seconds (default: 1800)")
    parser.add_argument("--cwd", help="Workspace directory (default: current dir)")

    args = parser.parse_args()

    # Handle stdin
    if args.prompt == "-":
        args.prompt = sys.stdin.read().strip()
        if not args.prompt:
            print("❌ Empty prompt from stdin", file=sys.stderr)
            sys.exit(1)

    result = run_god_agent_interactive(
        prompt=args.prompt,
        model_key=args.model,
        skills=args.skills,
        timeout=args.timeout,
        cwd=args.cwd,
    )

    if not result["ok"]:
        print(f"\n❌ FAILED at stage '{result.get('stage', '?')}': {result.get('error')}",
              file=sys.stderr)
        if "supported_models" in result:
            print(f"\nTry one of:", file=sys.stderr)
            for m in result["supported_models"]:
                print(f"  - {m}", file=sys.stderr)
        return 1

    return 0 if result.get("exit_code", 0) == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
