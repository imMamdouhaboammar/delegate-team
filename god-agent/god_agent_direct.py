#!/usr/bin/env python3
"""
god_agent_direct.py — Single-file God Agent coder.

Analog of vertex-coder/vertex_direct_coder.py. Reads a single file, sends it
to a premium model (via `codex exec` or `opencode run`), extracts the resulting
code from a markdown code block, and writes it back.

Usage:
    python3 god_agent_direct.py <target_file_path> <prompt> [model_key]
    python3 god_agent_direct.py <target_file_path> -                # read prompt from stdin
    cat brief.md | python3 god_agent_direct.py <target_file_path> -

Example:
    python3 god_agent_direct.py src/api/auth.ts "Add JWT validation middleware" minimax-m3-high-thinking
"""

import os
import re
import sys
import subprocess
import argparse

try:
    from model_router import (
        resolve_model,
        MODEL_REGISTRY,
        check_cli_available,
    )
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from model_router import (
        resolve_model,
        MODEL_REGISTRY,
        check_cli_available,
    )


SYSTEM_INSTRUCTION = """You are God Agent, an elite software engineer. \
Your task is to write or modify a single code file based on the user's instructions.

CRITICAL OUTPUT RULES:
1. Output ONLY the complete modified code wrapped in a single markdown code block.
2. Use the language-appropriate opening fence: ```python, ```typescript, ```bash, etc.
3. Do NOT write conversational filler, explanations, or "Here's the code:" preambles.
4. Do NOT output multiple code blocks — one block only, containing the full file.
5. Preserve comments and formatting where possible.
"""


def build_user_content(target_file_path: str, original_code: str, prompt: str) -> str:
    """Construct the user-side prompt with file context."""
    return (
        f"File: {os.path.basename(target_file_path)}\n"
        f"Path: {target_file_path}\n\n"
        f"Original code:\n"
        f"```\n{original_code}\n```\n\n"
        f"Instruction: {prompt}"
    )


def extract_code_block(text: str) -> str:
    """Extract the first ```lang\\n...\\n``` block from the model's response."""
    # Match ```<lang>\n(.*?)\n``` (DOTALL)
    match = re.search(r"```[a-zA-Z0-9_+\-#]*\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).rstrip()
    # Fallback: try without the language tag
    match = re.search(r"```\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).rstrip()
    return None


def run_god_agent_direct(target_file_path: str, prompt: str, model_key: str = "minimax-m3-high-thinking",
                         timeout: int = 180, dry_run: bool = False) -> dict:
    """Run the God Agent direct coder. Returns a result dict."""

    # 1. Resolve model → CLI invocation
    try:
        spec = resolve_model(model_key)
    except ValueError as e:
        return {"ok": False, "error": str(e), "stage": "resolve"}

    # 2. Check CLI is installed
    cli_check = check_cli_available(spec["cli"])
    if not cli_check["installed"]:
        return {
            "ok": False,
            "error": f"CLI '{spec['cli']}' is not installed (required for model '{model_key}')",
            "stage": "cli_check",
        }

    # 3. Read the original file (or treat as new)
    if os.path.exists(target_file_path):
        with open(target_file_path, "r", encoding="utf-8") as f:
            original_code = f.read()
        print(f"📄 Loaded '{target_file_path}' ({len(original_code)} chars).")
    else:
        original_code = ""
        print(f"📄 '{target_file_path}' does not exist — will be created as new file.")

    # 4. Build prompt
    user_content = build_user_content(target_file_path, original_code, prompt)

    # 5. Dry-run preview
    if dry_run:
        cmd = spec["base_command"] + ["<PROMPT>"]
        return {
            "ok": True,
            "dry_run": True,
            "command": cmd,
            "model": model_key,
            "model_flag": spec["model_flag"],
            "user_content_preview": user_content[:300] + "...",
        }

    # 6. Execute via CLI
    cmd = spec["base_command"] + [user_content]
    print(f"🚀 Invoking: {' '.join(cmd[:6])}... [prompt={len(user_content)} chars]")
    print(f"🎯 Model: {model_key} → {spec['cli']} {spec['model_flag']}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timeout after {timeout}s", "stage": "execute"}
    except FileNotFoundError:
        return {"ok": False, "error": f"CLI '{spec['cli']}' not found", "stage": "execute"}
    except Exception as e:
        return {"ok": False, "error": str(e), "stage": "execute"}

    if result.returncode != 0:
        # Try fallback if configured
        fallback_key = spec["fallback_key"]
        if fallback_key:
            print(f"⚠️  Primary failed (exit={result.returncode}). Trying fallback: {fallback_key}")
            return run_god_agent_direct(target_file_path, prompt, fallback_key, timeout, dry_run)

        return {
            "ok": False,
            "error": f"CLI exited with code {result.returncode}",
            "stderr": result.stderr[-2000:] if result.stderr else "",
            "stdout_tail": result.stdout[-500:] if result.stdout else "",
            "stage": "execute",
        }

    # 7. Extract code from markdown
    generated = extract_code_block(result.stdout)
    if not generated:
        return {
            "ok": False,
            "error": "Could not find a markdown code block in the model's response",
            "raw_response": result.stdout[-2000:],
            "stage": "parse",
        }

    # 8. Write back to file
    try:
        os.makedirs(os.path.dirname(os.path.abspath(target_file_path)), exist_ok=True)
        with open(target_file_path, "w", encoding="utf-8") as f:
            f.write(generated)
    except Exception as e:
        return {"ok": False, "error": f"Failed to write file: {e}", "stage": "write"}

    print(f"\n✅ SUCCESS: Wrote {len(generated)} chars to '{target_file_path}'")
    return {
        "ok": True,
        "model": model_key,
        "cli": spec["cli"],
        "model_flag": spec["model_flag"],
        "chars_written": len(generated),
        "target_file": target_file_path,
    }


def main():
    parser = argparse.ArgumentParser(
        description="God Agent Direct Coder — single-file premium-model code generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Available models (run 'python3 model_router.py list' for full list):
  codex-gpt-5.5-high            OpenAI GPT-5.5 high reasoning
  codex-gpt-5.4-high            OpenAI GPT-5.4 high reasoning
  opencode-glm-5.2-max          Zhipu GLM-5.2 max
  opencode-qwen-max             Alibaba Qwen 3.7 max
  opencode-kimi-k2.7-code-max   Moonshot Kimi K2.7 code-max
  minimax-m3-high-thinking      MiniMax M3 high thinking (default)
""",
    )
    parser.add_argument("target_file", help="File to create or modify")
    parser.add_argument("prompt", help="Instruction (use '-' to read from stdin)")
    parser.add_argument("model", nargs="?", default="minimax-m3-high-thinking",
                        help="Model key (default: minimax-m3-high-thinking)")
    parser.add_argument("--timeout", type=int, default=180, help="Timeout in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Preview without executing")

    args = parser.parse_args()

    # Handle stdin prompt
    if args.prompt == "-":
        args.prompt = sys.stdin.read().strip()
        if not args.prompt:
            print("❌ Empty prompt from stdin", file=sys.stderr)
            sys.exit(1)

    result = run_god_agent_direct(
        target_file_path=args.target_file,
        prompt=args.prompt,
        model_key=args.model,
        timeout=args.timeout,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print("\n--- DRY RUN ---")
        print(f"Command: {' '.join(result['command'])}")
        print(f"Model:   {result['model']} ({result['model_flag']})")
        print(f"Preview: {result['user_content_preview']}")
        return 0

    if not result["ok"]:
        print(f"\n❌ FAILED at stage '{result['stage']}': {result.get('error')}", file=sys.stderr)
        if "stderr" in result:
            print(f"\nstderr:\n{result['stderr']}", file=sys.stderr)
        if "raw_response" in result:
            print(f"\nraw response (last 2000 chars):\n{result['raw_response']}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
