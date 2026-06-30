#!/usr/bin/env python3
"""
minimax_interactive_agent.py — Multi-file autonomous MiniMax coding agent.

Analog of vertex-coder/vertex_interactive_agent.py. Hands off a complex task
to a MiniMax model with full tool-use support (file edit, grep, bash, memory,
skill loading) via the official `mmx` CLI.

Multi-turn loop:
1. Send user prompt + system prompt + tools to `mmx text chat`
2. Parse response — if model emits `tool_use` blocks, execute them locally
3. Append `tool_result` blocks to messages, write messages.json, send next turn
4. Loop until model emits final text (stop_reason != tool_use)

Usage:
    python3 minimax_interactive_agent.py "<prompt>" [model_name] [--skills skill1 skill2 ...]
    echo "brief" | python3 minimax_interactive_agent.py -

Examples:
    python3 minimax_interactive_agent.py "Build a complete Express.js backend with JWT auth" MiniMax-M3
    python3 minimax_interactive_agent.py "Refactor src/api/* to use async/await" MiniMax-M3 --skills test-driven-development
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date

try:
    from tools_registry import (
        ToolsRegistry,
        write_tool_files,
        load_skill_instructions,
        read_memories,
    )
except ImportError:
    print("Run from the minimax-coder/ directory.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Model registry (matches ~/.minimax/config.yaml whitelist)
# ---------------------------------------------------------------------------

MODEL_REGISTRY = {
    "MiniMax-M3": {
        "description": "Flagship, 450K context, multimodal, switchable thinking",
    },
    "MiniMax-M2.7": {
        "description": "Previous generation, 200K context, forced thinking",
    },
    "MiniMax-M2.7-highspeed": {
        "description": "M2.7 optimized for speed, 200K context",
    },
}

DEFAULT_MODEL = "MiniMax-M3"


# ---------------------------------------------------------------------------
# System instruction
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTION = """You are MiniMax Coder, an elite, fully autonomous AI software engineering agent that creates, modifies, and debugs code on the user's macOS system. You are powered by the MiniMax family of large language models (M3 flagship, M2.7, M2.7-highspeed). You are designed to be extremely fast, cost-effective, precise, and proactive.

## CORE DIRECTIVES (THE SECRET SAUCE)

### 1. STRICT RESPONSE CONCISENESS
- Conversational responses MUST be strictly under 4 lines. No chatty preambles, polite fillers, or postambles.

### 2. PROACTIVE QUALITY GATE & VERIFICATION
- You are authorized to run linters, type checkers, and test suites (pytest, npm test, vitest, eslint, tsc --noEmit) immediately after modifying code.
- Verify first, catch and fix errors, then report only the finalized, working state.

### 3. DEPENDENCY-FIRST PIPELINE
- Before writing code that imports a new package, install it via run_command (npm install / pip install).

### 4. DEEP CODEBASE INSPECTION
- If library docs are missing or types are failing, read package definitions directly from node_modules/<pkg>/package.json. Never guess.

### 5. PERSISTENT LOCAL MEMORY
- Use save_memory / read_memories (.agent_memory.json) to retain user preferences across sessions.

### 6. ELITE REFERENCE STYLE
- Reference files using path/file.ext:line_number format (e.g. src/app.py:145).

### 7. SYSTEMATIC REASONING GATES
- Before wide-scale changes, summarize your plan in 2-3 lines.

### 8. SURGICAL EDITS (CRITICAL)
- PREFER `line_replace` over `write_file` for existing files.
- Use "..." markers for unchanged blocks over 5 lines.
- NEVER rewrite large sections that don't need to change.

## TOOL SURFACE
- `list_dir`, `read_file`, `write_file`, `line_replace`, `grep_search` — file operations
- `run_command` — bash execution (60s default, up to 300s)
- `save_memory`, `read_memories` — persistent local memory
- `list_global_skills`, `load_skill` — load methodology skills on demand

## METHODOLOGY
1. Receive task → reason about scope and risks.
2. Plan briefly → identify files to read/modify/create.
3. Explore workspace → use grep_search + read_file to understand context.
4. Install deps → if you need a new package, install it BEFORE writing code.
5. Implement surgically → prefer line_replace over write_file.
6. Verify → run linters + tests, fix any failures, then declare done.

## SEO & FRONTEND DEFAULTS
For frontend work: semantic HTML, meta tags (title <60 chars, description <160 chars), single H1, alt attributes, mobile-responsive viewport.

## LANGUAGE
Reply in the same language as the user's message.

## DATE
Current date: {today}
"""


def build_system_instruction() -> str:
    return SYSTEM_INSTRUCTION.format(today=date.today().isoformat())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_mmx_available() -> dict:
    mmx_path = shutil.which("mmx")
    if not mmx_path:
        return {"ok": False, "error": "`mmx` CLI not found. Install: npm install -g mmx-cli"}
    try:
        result = subprocess.run(
            ["mmx", "auth", "status"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return {"ok": False, "error": "mmx not authenticated. Run: mmx auth login --api-key sk-xxxxx"}
        return {"ok": True, "path": mmx_path}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def call_mmx_with_messages(messages: list, tools: list, model: str,
                            system_prompt: str, timeout: int = 300) -> dict:
    """Invoke `mmx text chat` with a messages array + tools. Returns parsed response.

    Uses --messages-file (temp file) and --tool (per-tool temp files).
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write messages file
        messages_path = os.path.join(tmpdir, "messages.json")
        with open(messages_path, "w", encoding="utf-8") as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)

        # Write tool files
        tool_paths = write_tool_files(tmpdir)

        # Build command
        cmd = [
            "mmx", "text", "chat",
            "--model", model,
            "--system", system_prompt,
            "--messages-file", messages_path,
            "--output", "json",
        ]
        for tp in tool_paths:
            cmd.extend(["--tool", tp])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"mmx timeout after {timeout}s"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    if result.returncode != 0:
        return {
            "ok": False,
            "error": f"mmx exited with code {result.returncode}",
            "stderr": (result.stderr or "")[-500:],
            "stdout_tail": (result.stdout or "")[-300:],
        }

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error": f"Failed to parse mmx JSON: {e}",
            "raw": result.stdout[-500:],
        }

    return {
        "ok": True,
        "raw": data,
        "content": data.get("content", []),
        "stop_reason": data.get("stop_reason"),
        "model_used": data.get("model"),
        "usage": data.get("usage"),
    }


# ---------------------------------------------------------------------------
# Main interactive loop
# ---------------------------------------------------------------------------

def run_minimax_interactive_agent(prompt: str, model_name: str = DEFAULT_MODEL,
                                    skills: list = None,
                                    max_turns: int = 25,
                                    timeout: int = 600) -> dict:
    """Run the MiniMax interactive agent with multi-turn tool use via mmx CLI."""

    # 1. Validate
    if model_name not in MODEL_REGISTRY:
        return {"ok": False, "error": f"Unknown model '{model_name}'",
                "stage": "model",
                "available": list(MODEL_REGISTRY.keys())}
    mmx_check = check_mmx_available()
    if not mmx_check["ok"]:
        return {"ok": False, "error": mmx_check["error"], "stage": "mmx_check"}

    # 2. Build system prompt (base + skills + memory)
    full_system = build_system_instruction()
    memory = read_memories()
    if memory:
        full_system += "\n\n## ACTIVE PROJECT PREFERENCES & MEMORIES\n" + memory
    if skills:
        skills_block = load_skill_instructions(skills)
        if skills_block:
            full_system += skills_block

    # 3. Initialize conversation
    messages = [
        {"role": "user", "content": [{"type": "text", "text": prompt}]}
    ]

    registry = ToolsRegistry()

    print(f"==============================================================")
    print(f"🚀 Launching MiniMax Coder (Interactive, mmx transport)")
    print(f"🎯 Model: {model_name}")
    print(f"💼 Workspace: {os.getcwd()}")
    print(f"🔗 CLI: {mmx_check['path']}")
    if skills:
        print(f"📚 Pre-loaded skills: {', '.join(skills)}")
    if memory:
        print(f"🧠 Persistent memory loaded")
    print(f"==============================================================\n")

    # 4. Multi-turn loop
    turn = 0
    final_text = None
    try:
        while turn < max_turns:
            turn += 1
            print(f"\n--- [Turn {turn}] Calling {model_name} ---")
            response = call_mmx_with_messages(
                messages=messages,
                tools=registry.get_anthropic_tools(),
                model=model_name,
                system_prompt=full_system,
                timeout=timeout,
            )

            if not response["ok"]:
                return {"ok": False, "error": response["error"], "stage": "api", "turns": turn}

            content = response["content"]
            stop_reason = response.get("stop_reason")

            # Find tool_use blocks + text blocks
            tool_uses = [b for b in content if b.get("type") == "tool_use"]
            text_parts = [b.get("text", "") for b in content if b.get("type") == "text"]

            usage = response.get("usage", {})
            print(f"🤖 Model response: stop_reason={stop_reason}, "
                  f"text={sum(len(t) for t in text_parts)} chars, "
                  f"tool_uses={len(tool_uses)} (tokens: in={usage.get('input_tokens', '?')}, "
                  f"out={usage.get('output_tokens', '?')})")

            # Append assistant message
            messages.append({"role": "assistant", "content": content})

            if not tool_uses or stop_reason != "tool_use":
                # No more tool calls — agent is done
                final_text = "\n".join(text_parts)
                break

            # Execute each tool
            print(f"🔧 Executing {len(tool_uses)} tool(s):")
            tool_results = []
            for tu in tool_uses:
                name = tu.get("name")
                args = tu.get("input", {})
                tool_use_id = tu.get("id")
                args_preview = str(args)
                if len(args_preview) > 200:
                    args_preview = args_preview[:200] + "..."
                print(f"   └─ {name}({args_preview})")

                result_str = registry.execute_tool(name, args)
                result_preview = result_str
                if len(result_preview) > 300:
                    result_preview = result_preview[:300] + "..."
                print(f"   └─ Outcome: {result_preview}")

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result_str,
                })

            # Append user message with tool_results
            messages.append({"role": "user", "content": tool_results})

        if turn >= max_turns:
            print(f"\n⚠️  Reached max turns ({max_turns}). Stopping.")

        print(f"\n🎉 Task execution complete after {turn} turn(s).")
        if final_text:
            print(f"\n🤖 Final response:\n{final_text}")

        return {
            "ok": True,
            "model": model_name,
            "turns": turn,
            "final_text": final_text,
            "stop_reason": stop_reason,
        }

    except KeyboardInterrupt:
        return {"ok": False, "error": "Interrupted by user", "stage": "loop", "turns": turn}
    except Exception as e:
        return {"ok": False, "error": str(e), "stage": "loop", "turns": turn}


def main():
    parser = argparse.ArgumentParser(
        description="MiniMax Coder Interactive — multi-file autonomous agent via `mmx` CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""Available models:
  MiniMax-M3                MiniMax flagship (default), 450K context, multimodal, switchable thinking
  MiniMax-M2.7              Previous gen, 200K context, forced thinking
  MiniMax-M2.7-highspeed    M2.7 speed-optimized, 200K context

Transport: `mmx text chat` CLI (https://github.com/MiniMax-AI/cli)
Setup:     npm install -g mmx-cli && mmx auth login --api-key sk-xxxxx
""",
    )
    parser.add_argument("prompt", help="Task prompt (use '-' to read from stdin)")
    parser.add_argument("model", nargs="?", default=DEFAULT_MODEL,
                        help=f"Model name (default: {DEFAULT_MODEL})")
    parser.add_argument("-s", "--skills", nargs="+", default=[],
                        help="Skills to preload")
    parser.add_argument("--max-turns", type=int, default=25, help="Max tool-use turns (default: 25)")
    parser.add_argument("--timeout", type=int, default=600, help="Per-call timeout in seconds")

    args = parser.parse_args()

    if args.prompt == "-":
        args.prompt = sys.stdin.read().strip()
        if not args.prompt:
            print("❌ Empty prompt from stdin", file=sys.stderr)
            sys.exit(1)

    result = run_minimax_interactive_agent(
        prompt=args.prompt,
        model_name=args.model,
        skills=args.skills,
        max_turns=args.max_turns,
        timeout=args.timeout,
    )

    if not result["ok"]:
        print(f"\n❌ FAILED at stage '{result.get('stage', '?')}': {result.get('error')}",
              file=sys.stderr)
        if "available" in result:
            print(f"\nTry one of: {', '.join(result['available'])}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
