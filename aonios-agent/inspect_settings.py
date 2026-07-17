#!/usr/bin/env python3
"""
inspect_settings.py — Health check for all Aonios Agent backends.

Verifies:
- Codex CLI installed + logged in
- OpenCode CLI installed + at least one Aonios Agent model reachable
- Persistent memory location + writability

Usage:
    python3 inspect_settings.py           # text output
    python3 inspect_settings.py --json    # JSON output
"""

import argparse
import json
import os
import subprocess
import sys

try:
    from model_router import (
        MODEL_REGISTRY,
        check_cli_available,
        check_all_backends,
    )
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from model_router import (
        MODEL_REGISTRY,
        check_cli_available,
        check_all_backends,
    )


AONIOS_AGENT_MEMORY_PATH = os.environ.get(
    "AONIOS_AGENT_MEMORY",
    os.path.join(os.getcwd(), ".aonios_agent_memory.json"),
)

AONIOS_AGENT_CONFIG_PATH = os.environ.get(
    "AONIOS_AGENT_CONFIG",
    os.path.expanduser("~/.config/aonios-agent/models.json"),
)


def check_codex_login() -> dict:
    """Check codex login status without exposing credentials."""
    try:
        result = subprocess.run(
            ["codex", "login", "status"],
            capture_output=True, text=True, timeout=15,
        )
        logged_in = result.returncode == 0 and "logged in" in (result.stdout + result.stderr).lower()
        return {
            "ok": logged_in,
            "stdout_tail": (result.stdout or "")[-300:].strip(),
            "stderr_tail": (result.stderr or "")[-300:].strip(),
        }
    except FileNotFoundError:
        return {"ok": False, "error": "codex binary not found"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "codex login status timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check_opencode_models_sample() -> dict:
    """Verify opencode can list models (proxy for authentication + connectivity)."""
    try:
        result = subprocess.run(
            ["opencode", "models"],
            capture_output=True, text=True, timeout=30,
        )
        output = result.stdout or ""
        god_models = [v["model_flag"] for v in MODEL_REGISTRY.values() if v["cli"] == "opencode"]
        found = [m for m in god_models if m in output]
        return {
            "ok": result.returncode == 0,
            "god_models_found": found,
            "god_models_missing": [m for m in god_models if m not in found],
            "stdout_tail": output[-300:].strip(),
        }
    except FileNotFoundError:
        return {"ok": False, "error": "opencode binary not found"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "opencode models list timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check_memory_writable() -> dict:
    """Check if the memory file location is writable."""
    path = AONIOS_AGENT_MEMORY_PATH
    directory = os.path.dirname(path) or "."
    exists = os.path.exists(path)
    writable_dir = os.access(directory, os.W_OK)
    if exists:
        writable_file = os.access(path, os.W_OK)
        return {
            "exists": exists,
            "writable": writable_file and writable_dir,
            "path": path,
        }
    return {
        "exists": False,
        "writable": writable_dir,
        "path": path,
        "note": "Will be created on first save_memory call",
    }


def main():
    parser = argparse.ArgumentParser(description="Aonios Agent health check")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    report = {
        "clis": check_all_backends(),
        "codex_login": check_codex_login(),
        "opencode_models": check_opencode_models_sample(),
        "memory": check_memory_writable(),
        "config_override": {
            "path": AONIOS_AGENT_CONFIG_PATH,
            "exists": os.path.exists(AONIOS_AGENT_CONFIG_PATH),
        },
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("\n🏥  Aonios Agent Health Check\n")

    # CLIs
    print("📦 CLI backends:")
    for cli, info in report["clis"].items():
        if info["installed"]:
            print(f"  ✓ {cli:10}  {info['version']:20}  {info['path']}")
        else:
            print(f"  ✗ {cli:10}  NOT INSTALLED")
    print()

    # Codex login
    print("🔐 Codex login:")
    if report["codex_login"].get("ok"):
        print("  ✓ logged in")
    else:
        print("  ✗ not logged in or status check failed")
        if "stderr_tail" in report["codex_login"]:
            print(f"    stderr: {report['codex_login']['stderr_tail']}")
        print("    fix: run `codex login` to authenticate")
    print()

    # Opencode models
    print("🤖 Opencode Aonios Agent models:")
    models = report["opencode_models"]
    if models.get("god_models_found"):
        for m in models["god_models_found"]:
            print(f"  ✓ {m}")
    if models.get("god_models_missing"):
        for m in models["god_models_missing"]:
            print(f"  ✗ {m}  (model not in `opencode models` output)")
    if models.get("error"):
        print(f"  ✗ {models['error']}")
    print()

    # Memory
    print("🧠 Persistent memory:")
    mem = report["memory"]
    if mem["writable"]:
        if mem["exists"]:
            print(f"  ✓ {mem['path']} (exists, writable)")
        else:
            print(f"  ✓ {mem['path']} (writable, will be created on first save)")
    else:
        print(f"  ✗ {mem['path']} (NOT writable)")
    print()

    # Config override
    print("⚙️  Config override:")
    cfg = report["config_override"]
    if cfg["exists"]:
        print(f"  ✓ {cfg['path']} (loaded)")
    else:
        print(f"  - {cfg['path']} (not present — using built-in defaults)")
    print()

    # Summary
    overall_ok = (
        all(c["installed"] for c in report["clis"].values())
        and report["codex_login"].get("ok", False)
        and report["opencode_models"].get("ok", False)
        and report["memory"]["writable"]
    )
    if overall_ok:
        print("✅  All systems operational. Aonios Agent ready.\n")
        return 0
    else:
        print("⚠️  Some backends are not ready. See details above.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
