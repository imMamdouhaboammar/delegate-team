#!/usr/bin/env python3
"""
inspect_settings.py — Health check for MiniMax Coder backend (mmx transport).

Verifies:
- `mmx` CLI installed and on PATH
- `mmx auth login` authenticated
- Token Plan quota available
- Persistent memory location writable
- Optional: ~/.minimax/config.yaml has matching whitelist

Usage:
    python3 inspect_settings.py           # text output
    python3 inspect_settings.py --json    # JSON output
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

from minimax_direct_coder import MODEL_REGISTRY, DEFAULT_MODEL


AGENT_MEMORY_PATH = os.environ.get(
    "AGENT_MEMORY",
    os.path.join(os.getcwd(), ".agent_memory.json"),
)


def check_mmx_installed() -> dict:
    """Verify `mmx` CLI is installed."""
    mmx_path = shutil.which("mmx")
    if not mmx_path:
        return {"ok": False, "error": "`mmx` CLI not found"}
    try:
        result = subprocess.run(
            ["mmx", "--version"], capture_output=True, text=True, timeout=10,
        )
        version = (result.stdout or result.stderr).strip().split("\n")[0]
        return {"ok": True, "path": mmx_path, "version": version}
    except Exception as e:
        return {"ok": True, "path": mmx_path, "version": f"(version check failed: {e})"}


def check_mmx_auth() -> dict:
    """Verify mmx is authenticated (login state)."""
    try:
        result = subprocess.run(
            ["mmx", "auth", "status"], capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return {
                "ok": False,
                "error": "mmx not authenticated",
                "hint": "Run: mmx auth login --api-key sk-xxxxx",
            }
        # Parse JSON status
        try:
            status = json.loads(result.stdout)
            method = status.get("method", "?")
            source = status.get("source", "?")
            key_preview = status.get("key", "?")
            return {
                "ok": True,
                "method": method,
                "source": source,
                "key_preview": key_preview,
            }
        except json.JSONDecodeError:
            return {"ok": True, "raw": result.stdout.strip()}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "mmx auth status timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check_mmx_quota() -> dict:
    """Check current Token Plan quota."""
    try:
        result = subprocess.run(
            ["mmx", "quota"], capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return {"ok": False, "error": f"mmx quota failed: {result.stderr.strip()[:200]}"}
        try:
            data = json.loads(result.stdout)
            return {"ok": True, "data": data}
        except json.JSONDecodeError:
            return {"ok": True, "raw": result.stdout.strip()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check_minimax_config_yaml() -> dict:
    """Verify ~/.minimax/config.yaml has MiniMax provider configured."""
    config_path = os.path.expanduser("~/.minimax/config.yaml")
    if not os.path.exists(config_path):
        return {"exists": False, "path": config_path}
    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        provider = data.get("provider", {}).get("minimax", {})
        whitelist = provider.get("whitelist", [])
        models = list(provider.get("models", {}).keys())
        return {
            "exists": True,
            "path": config_path,
            "whitelist": whitelist,
            "models_available": models,
            "all_minimax_coder_models_in_whitelist": all(m in whitelist for m in MODEL_REGISTRY.keys()),
        }
    except ImportError:
        return {"exists": True, "path": config_path, "yaml_module": "not installed"}
    except Exception as e:
        return {"exists": True, "path": config_path, "error": str(e)}


def check_memory_writable() -> dict:
    path = AGENT_MEMORY_PATH
    directory = os.path.dirname(path) or "."
    exists = os.path.exists(path)
    writable_dir = os.access(directory, os.W_OK)
    if exists:
        writable_file = os.access(path, os.W_OK)
        return {"exists": exists, "writable": writable_file and writable_dir, "path": path}
    return {
        "exists": False,
        "writable": writable_dir,
        "path": path,
        "note": "Will be created on first save_memory call",
    }


def main():
    parser = argparse.ArgumentParser(description="MiniMax Coder health check")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    report = {
        "mmx_installed": check_mmx_installed(),
        "mmx_auth": check_mmx_auth(),
        "mmx_quota": check_mmx_quota(),
        "config_yaml": check_minimax_config_yaml(),
        "memory": check_memory_writable(),
        "default_model": DEFAULT_MODEL,
        "registered_models": list(MODEL_REGISTRY.keys()),
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("\n🏥  MiniMax Coder Health Check (mmx transport)\n")

    print("📦 mmx CLI:")
    m = report["mmx_installed"]
    if m["ok"]:
        print(f"  ✓ {m['version']:30}  {m['path']}")
    else:
        print(f"  ✗ {m.get('error')}")
        print(f"     Install: npm install -g mmx-cli")
    print()

    print("🔐 mmx auth:")
    a = report["mmx_auth"]
    if a["ok"]:
        if "method" in a:
            print(f"  ✓ authenticated (method={a['method']}, source={a['source']}, key={a['key_preview']})")
        else:
            print(f"  ✓ authenticated")
    else:
        print(f"  ✗ {a.get('error')}")
        if "hint" in a:
            print(f"     {a['hint']}")
    print()

    print("📊 mmx quota (Token Plan):")
    q = report["mmx_quota"]
    if q["ok"]:
        if "data" in q:
            data = q["data"]
            for entry in data.get("model_remains", [])[:3]:
                model_name = entry.get("model_name", "?")
                remains = entry.get("current_interval_usage_count", 0)
                total = entry.get("current_interval_total_count", "?")
                print(f"  • {model_name}: usage {remains}/{total}")
        else:
            print(f"  ✓ {q.get('raw', '')[:200]}")
    else:
        print(f"  ✗ {q.get('error')}")
    print()

    print("⚙️  ~/.minimax/config.yaml:")
    c = report["config_yaml"]
    if c["exists"]:
        print(f"  ✓ {c['path']}")
        if "whitelist" in c:
            print(f"     whitelist: {', '.join(c['whitelist'])}")
        if "models_available" in c:
            print(f"     models: {', '.join(c['models_available'])}")
        if c.get("all_minimax_coder_models_in_whitelist"):
            print(f"     ✓ all 3 MiniMax Coder models are whitelisted")
        elif "whitelist" in c:
            missing = [m for m in MODEL_REGISTRY.keys() if m not in c["whitelist"]]
            print(f"     ⚠️  not whitelisted: {', '.join(missing)}")
        if "error" in c:
            print(f"     ⚠️  {c['error']}")
    else:
        print(f"  ✗ {c.get('path')} not found (mmx will use its built-in defaults)")
    print()

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

    overall_ok = (
        report["mmx_installed"]["ok"]
        and report["mmx_auth"]["ok"]
        and report["memory"]["writable"]
    )
    if overall_ok:
        print(f"✅  All systems operational. MiniMax Coder ready (default: {DEFAULT_MODEL}).\n")
        return 0
    else:
        print("⚠️  Some checks failed. See details above.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
