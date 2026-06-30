"""
minimax_direct_coder.py — Single-file MiniMax coder using the official `mmx` CLI.

`mmx` (https://github.com/MiniMax-AI/cli) is the official MiniMax CLI that handles
auth, region detection, and API calls. We use it as the transport so we don't have
to re-implement the MiniMax Messages API protocol.

This script mirrors vertex-coder's structure (direct mode + interactive mode + tools
registry) but routes everything through `mmx text chat`. It works as a local agent
helper — Mavis can invoke it directly via bash, or use `mmx text chat` inline.

Three MiniMax models supported (per `~/.minimax/config.yaml`):
  - MiniMax-M3                flagship, 450K context, switchable thinking (default)
  - MiniMax-M2.7              previous gen, 200K context, forced thinking
  - MiniMax-M2.7-highspeed    M2.7 optimized for speed

Usage:
    python3 minimax_direct_coder.py <target_file_path> <prompt> [model_name]
    python3 minimax_direct_coder.py <target_file_path> -    # read prompt from stdin
    python3 minimax_direct_coder.py <target_file_path> <prompt> --dry-run

Examples:
    python3 minimax_direct_coder.py src/api/auth.ts "Add JWT validation middleware" MiniMax-M3
    echo "Quick typo fix" | python3 minimax_direct_coder.py src/utils.ts - MiniMax-M2.7-highspeed
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys


# ---------------------------------------------------------------------------
# Model registry (matches ~/.minimax/config.yaml whitelist)
# ---------------------------------------------------------------------------

MODEL_REGISTRY = {
    "MiniMax-M3": {
        "description": "Flagship, 450K context, multimodal, switchable thinking",
        "supports_thinking": True,
    },
    "MiniMax-M2.7": {
        "description": "Previous generation, 200K context, forced thinking",
        "supports_thinking": True,
    },
    "MiniMax-M2.7-highspeed": {
        "description": "M2.7 optimized for speed, 200K context",
        "supports_thinking": True,
    },
}

DEFAULT_MODEL = "MiniMax-M3"


# ---------------------------------------------------------------------------
# System instruction
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTION = """You are MiniMax Coder, an elite, world-class software engineer powered by the MiniMax family of large language models. Your task is to write and modify code based on the user's instructions.

CRITICAL OUTPUT RULES:
1. Output ONLY the complete modified code wrapped in a single markdown code block.
2. Use the language-appropriate opening fence: ```python, ```typescript, ```bash, etc.
3. Do NOT write conversational filler, explanations, or "Here's the code:" preambles.
4. Do NOT output multiple code blocks — one block only, containing the full file.
5. Preserve comments and formatting where possible.

Current date: {today}
"""


def build_system_instruction() -> str:
    from datetime import date
    return SYSTEM_INSTRUCTION.format(today=date.today().isoformat())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_mmx_available() -> dict:
    """Verify `mmx` CLI is installed and authenticated."""
    mmx_path = shutil.which("mmx")
    if not mmx_path:
        return {
            "ok": False,
            "error": "`mmx` CLI not found. Install: npm install -g mmx-cli",
        }

    # Check auth status
    try:
        result = subprocess.run(
            ["mmx", "auth", "status"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return {
                "ok": False,
                "error": "mmx not authenticated. Run: mmx auth login --api-key sk-xxxxx",
            }
        return {"ok": True, "path": mmx_path, "auth_status": result.stdout.strip()}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "mmx auth status timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def extract_code_block(text: str) -> str:
    """Extract the first ```lang\\n...\\n``` block from the model's response."""
    match = re.search(r"```[a-zA-Z0-9_+\-#]*\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).rstrip()
    match = re.search(r"```\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).rstrip()
    return None


def call_mmx_text_chat(prompt: str, model: str, system_prompt: str,
                        timeout: int = 180) -> dict:
    """Invoke `mmx text chat` and parse the JSON response.

    Returns: {"ok": True, "text": "...", "thinking": "...", "usage": {...}}
             or {"ok": False, "error": "..."}
    """
    cmd = [
        "mmx", "text", "chat",
        "--model", model,
        "--system", system_prompt,
        "--message", prompt,
        "--output", "json",  # ensure machine-readable (single JSON envelope on stdout)
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"mmx timeout after {timeout}s"}
    except FileNotFoundError:
        return {"ok": False, "error": "`mmx` CLI not found"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if result.returncode != 0:
        return {
            "ok": False,
            "error": f"mmx exited with code {result.returncode}",
            "stderr": (result.stderr or "")[-500:],
            "stdout_tail": (result.stdout or "")[-300:],
        }

    # Parse JSON response — mmx may emit multiple JSON objects (event stream);
    # the last one is typically the final assistant message.
    text_content = ""
    thinking_content = ""
    usage_info = None
    model_used = None
    try:
        # Try parsing the whole output as one JSON first
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            # Fallback: parse last JSON line
            lines = [ln for ln in result.stdout.strip().split("\n") if ln.strip()]
            if not lines:
                return {"ok": False, "error": "Empty response from mmx"}
            data = json.loads(lines[-1])

        # Extract text + thinking + usage from content blocks
        if isinstance(data, dict) and "content" in data:
            model_used = data.get("model")
            usage_info = data.get("usage")
            for block in data["content"]:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "text":
                    text_content += block.get("text", "")
                elif btype == "thinking":
                    thinking_content += block.get("thinking", "")
        else:
            # Fallback: maybe it's an event-stream array
            text_content = result.stdout
    except Exception as e:
        return {
            "ok": False,
            "error": f"Failed to parse mmx JSON response: {e}",
            "raw_output": result.stdout[-500:],
        }

    if not text_content and not thinking_content:
        return {
            "ok": False,
            "error": "Empty response from mmx",
            "raw_output": result.stdout[-500:],
        }

    return {
        "ok": True,
        "text": text_content,
        "thinking": thinking_content,
        "usage": usage_info,
        "model_used": model_used,
        "raw": data,
    }


# ---------------------------------------------------------------------------
# Main coder
# ---------------------------------------------------------------------------

def run_minimax_direct_coder(target_file_path: str, prompt: str,
                              model_name: str = DEFAULT_MODEL,
                              timeout: int = 180,
                              dry_run: bool = False) -> dict:
    """Run the MiniMax direct coder via mmx CLI. Returns a result dict."""

    # 1. Validate model
    if model_name not in MODEL_REGISTRY:
        return {
            "ok": False,
            "error": f"Unknown model '{model_name}'. Available: {', '.join(MODEL_REGISTRY.keys())}",
            "stage": "model",
        }

    # 2. Check mmx availability
    mmx_check = check_mmx_available()
    if not mmx_check["ok"]:
        return {"ok": False, "error": mmx_check["error"], "stage": "mmx_check"}

    # 3. Read original file (or treat as new)
    if os.path.exists(target_file_path):
        with open(target_file_path, "r", encoding="utf-8") as f:
            original_code = f.read()
        print(f"📄 Loaded '{target_file_path}' ({len(original_code)} chars).")
    else:
        original_code = ""
        print(f"📄 '{target_file_path}' does not exist — will be created as new file.")

    # 4. Build prompt
    user_content = (
        f"File: {os.path.basename(target_file_path)}\n\n"
        f"Original code:\n"
        f"```\n{original_code}\n```\n\n"
        f"Instruction: {prompt}"
    )

    # 5. Dry-run preview
    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "model": model_name,
            "command": ["mmx", "text", "chat", "--model", model_name, "--message", "<PROMPT>"],
            "user_content_preview": user_content[:300] + "...",
        }

    # 6. Call mmx
    print(f"🚀 Invoking mmx (model={model_name})...")
    response = call_mmx_text_chat(
        prompt=user_content,
        model=model_name,
        system_prompt=build_system_instruction(),
        timeout=timeout,
    )

    if not response["ok"]:
        return {"ok": False, "error": response["error"], "stage": "api"}

    text = response["text"]
    print(f"🤖 Received response ({len(text)} chars, {len(response['thinking'])} thinking chars)")

    # 7. Extract code from markdown
    generated = extract_code_block(text)
    if not generated:
        return {
            "ok": False,
            "error": "Could not find a markdown code block in the model's response",
            "raw_response": text[-1500:],
            "stage": "parse",
        }

    # 8. Write to file
    try:
        os.makedirs(os.path.dirname(os.path.abspath(target_file_path)), exist_ok=True)
        with open(target_file_path, "w", encoding="utf-8") as f:
            f.write(generated)
    except Exception as e:
        return {"ok": False, "error": f"Failed to write file: {e}", "stage": "write"}

    # 9. Report
    usage = response.get("usage", {})
    print(f"\n✅ SUCCESS: Wrote {len(generated)} chars to '{target_file_path}'")
    if usage:
        print(f"📊 Tokens: input={usage.get('input_tokens', '?')}, output={usage.get('output_tokens', '?')}")

    return {
        "ok": True,
        "model": model_name,
        "model_used": response.get("model_used"),
        "chars_written": len(generated),
        "target_file": target_file_path,
        "usage": usage,
    }


def main():
    parser = argparse.ArgumentParser(
        description="MiniMax Direct Coder — single-file premium-model code generation via `mmx` CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""Available models:
  MiniMax-M3                MiniMax flagship (default), 450K context, multimodal, switchable thinking
  MiniMax-M2.7              Previous gen, 200K context, forced thinking
  MiniMax-M2.7-highspeed    M2.7 speed-optimized, 200K context

Transport: `mmx text chat` CLI (https://github.com/MiniMax-AI/cli)
Setup:     npm install -g mmx-cli && mmx auth login --api-key sk-xxxxx
""",
    )
    parser.add_argument("target_file", help="File to create or modify")
    parser.add_argument("prompt", help="Instruction (use '-' to read from stdin)")
    parser.add_argument("model", nargs="?", default=DEFAULT_MODEL,
                        help=f"Model name (default: {DEFAULT_MODEL})")
    parser.add_argument("--timeout", type=int, default=180, help="Timeout in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Preview without executing")

    args = parser.parse_args()

    # Handle stdin prompt
    if args.prompt == "-":
        args.prompt = sys.stdin.read().strip()
        if not args.prompt:
            print("❌ Empty prompt from stdin", file=sys.stderr)
            sys.exit(1)

    result = run_minimax_direct_coder(
        target_file_path=args.target_file,
        prompt=args.prompt,
        model_name=args.model,
        timeout=args.timeout,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print("\n--- DRY RUN ---")
        print(f"Command: {' '.join(result['command'])}")
        print(f"Model:   {result['model']}")
        print(f"Preview: {result['user_content_preview']}")
        return 0

    if not result["ok"]:
        print(f"\n❌ FAILED at stage '{result.get('stage', '?')}': {result.get('error')}",
              file=sys.stderr)
        if "raw_response" in result:
            print(f"\nraw response (last 1500 chars):\n{result['raw_response']}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
