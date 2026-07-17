"""
model_router.py — Maps God Agent model names to CLI invocations.

The "God Agent" routes coding tasks to whichever premium model is best for the job.
Unlike vertex-coder (which uses Google GenAI SDK), this layer shells out to local CLI
binaries (`codex` and `opencode`) so each model runs in its own optimized runtime.

Design philosophy:
- Literal passthrough: model names are passed to the CLI exactly as configured
  (per Mamdouh's instruction). No remapping, no guessing.
- Per-model CLI selection: some models run via `codex exec`, others via `opencode run`.
- Failover is the caller's responsibility (God Agent returns error, caller retries).

To add a new model:
1. Add an entry to MODEL_REGISTRY below.
2. Pick the right CLI (`codex` or `opencode`).
3. Provide the exact `--model` flag value the CLI expects.
4. (Optional) Set `fallback` to another registered model key for failover.
"""

import os
import json
import shutil
import subprocess
import sys
from typing import Optional


# ---------------------------------------------------------------------------
# Canonical Model Registry
# ---------------------------------------------------------------------------

MODEL_REGISTRY = {
    # === Codex (OpenAI) models — routed through `codex exec` ===
    "codex-gpt-5.5-high": {
        "cli": "codex",
        "cli_subcommand": "exec",
        "model_flag": "gpt 5.5 high",          # literal passthrough
        "fallback": "codex-gpt-5.4-high",
        "family": "openai",
        "tier": "high",
        "description": "OpenAI GPT-5.5 high reasoning",
        "supports_interactive": False,           # codex exec is single-turn
        "supports_direct": True,
    },
    "codex-gpt-5.4-high": {
        "cli": "codex",
        "cli_subcommand": "exec",
        "model_flag": "gpt 5.4 high",          # literal passthrough
        "fallback": None,
        "family": "openai",
        "tier": "high",
        "description": "OpenAI GPT-5.4 high reasoning",
        "supports_interactive": False,
        "supports_direct": True,
    },

    # === OpenCode routed models — all go through `opencode run` ===
    "opencode-glm-5.2-max": {
        "cli": "opencode",
        "cli_subcommand": "run",
        "model_flag": "opencode-go/glm-5.2",
        "fallback": None,
        "family": "zhipu",
        "tier": "max",
        "description": "Zhipu GLM-5.2 max reasoning",
        "supports_interactive": True,
        "supports_direct": True,
    },
    "opencode-qwen-max": {
        "cli": "opencode",
        "cli_subcommand": "run",
        "model_flag": "opencode-go/qwen3.7-max",
        "fallback": None,
        "family": "alibaba",
        "tier": "max",
        "description": "Alibaba Qwen 3.7 max",
        "supports_interactive": True,
        "supports_direct": True,
    },
    "opencode-kimi-k2.7-code-max": {
        "cli": "opencode",
        "cli_subcommand": "run",
        "model_flag": "opencode-go/kimi-k2.7-code",
        "fallback": None,
        "family": "moonshot",
        "tier": "code-max",
        "description": "Moonshot Kimi K2.7 code-max (specialized for code)",
        "supports_interactive": True,
        "supports_direct": True,
    },
    "minimax-m3-high-thinking": {
        "cli": "opencode",
        "cli_subcommand": "run",
        "model_flag": "opencode-go/minimax-m3",
        "fallback": None,
        "family": "minimax",
        "tier": "high-thinking",
        "description": "MiniMax M3 high thinking (Apeiron / MiniMax flagship)",
        "supports_interactive": True,
        "supports_direct": True,
    },
}


# ---------------------------------------------------------------------------
# Config override (lets users customize model strings without editing this file)
# ---------------------------------------------------------------------------

GOD_AGENT_CONFIG_PATH = os.environ.get(
    "GOD_AGENT_CONFIG",
    os.path.expanduser("~/.config/god-agent/models.json"),
)


def _load_config_overrides() -> dict:
    """Load optional config overrides. Format:
       {
         "<model_key>": {
           "model_flag": "<override-string>",
           "fallback": "<other-key>"
         }
       }
    """
    if not os.path.exists(GOD_AGENT_CONFIG_PATH):
        return {}
    try:
        with open(GOD_AGENT_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️  Failed to load God Agent config override at {GOD_AGENT_CONFIG_PATH}: {e}",
              file=sys.stderr)
        return {}


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def resolve_model(model_key: str) -> dict:
    """Resolve a model_key → full CLI invocation spec.

    Returns:
      {
        "cli": str,                 # "codex" or "opencode"
        "subcommand": str,          # "exec" or "run"
        "model_flag": str,          # the literal --model flag value
        "model_flag_arg": list,     # ["--model", "<model_flag>"]
        "base_command": list,       # full base command WITHOUT the prompt
        "fallback_key": Optional[str],
        "registry_entry": dict,     # full entry
      }
    """
    if model_key not in MODEL_REGISTRY:
        raise ValueError(
            f"Unknown God Agent model: '{model_key}'. "
            f"Available: {', '.join(sorted(MODEL_REGISTRY.keys()))}"
        )

    entry = dict(MODEL_REGISTRY[model_key])  # copy
    overrides = _load_config_overrides()
    if model_key in overrides:
        entry.update(overrides[model_key])

    model_flag = entry["model_flag"]
    base_command = [entry["cli"], entry["cli_subcommand"]]
    if entry["cli"] == "opencode":
        base_command += ["-m", model_flag]
    elif entry["cli"] == "codex":
        base_command += ["--model", model_flag]

    return {
        "cli": entry["cli"],
        "subcommand": entry["cli_subcommand"],
        "model_flag": model_flag,
        "model_flag_arg": ["--model", model_flag] if entry["cli"] == "codex" else ["-m", model_flag],
        "base_command": base_command,
        "fallback_key": entry.get("fallback"),
        "registry_entry": entry,
    }


def list_models() -> list:
    """Return sorted list of (key, entry) tuples."""
    return sorted(MODEL_REGISTRY.items(), key=lambda kv: kv[0])


def models_for_mode(mode: str) -> list:
    """Return models that support a given mode ('direct' or 'interactive')."""
    flag = "supports_" + mode
    return [(k, v) for k, v in MODEL_REGISTRY.items() if v.get(flag)]


# ---------------------------------------------------------------------------
# Backend availability check
# ---------------------------------------------------------------------------

def check_cli_available(cli_name: str) -> dict:
    """Check if a CLI binary is installed and on PATH."""
    path = shutil.which(cli_name)
    if not path:
        return {"cli": cli_name, "installed": False, "path": None, "version": None}

    version = None
    try:
        result = subprocess.run(
            [cli_name, "--version"],
            capture_output=True, text=True, timeout=10,
        )
        version = (result.stdout or result.stderr).strip().split("\n")[0]
    except Exception:
        version = "(unable to query)"

    return {"cli": cli_name, "installed": True, "path": path, "version": version}


def check_all_backends() -> dict:
    """Check availability of codex + opencode."""
    return {
        "codex": check_cli_available("codex"),
        "opencode": check_cli_available("opencode"),
    }


# ---------------------------------------------------------------------------
# CLI usage
# ---------------------------------------------------------------------------

def _print_table(rows, headers):
    """Pretty-print a 2D table."""
    widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    sep = "  "
    print(sep.join(h.ljust(widths[i]) for i, h in enumerate(headers)))
    print(sep.join("-" * widths[i] for i in range(len(headers))))
    for row in rows:
        print(sep.join(str(row[i]).ljust(widths[i]) for i in range(len(headers))))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="God Agent Model Router")
    sub = parser.add_subparsers(dest="cmd")

    p_list = sub.add_parser("list", help="List all registered models")
    p_list.add_argument("--mode", choices=["direct", "interactive", "all"], default="all")

    p_resolve = sub.add_parser("resolve", help="Resolve a model key to CLI invocation")
    p_resolve.add_argument("model_key")

    p_check = sub.add_parser("check", help="Check CLI backend availability")

    args = parser.parse_args()

    if args.cmd == "list":
        print("\n🤖  God Agent Model Registry\n")
        backends = check_all_backends()

        if args.mode == "all":
            rows = [(k, v["cli"], v["model_flag"], v["family"], v["tier"],
                     "Y" if v["supports_direct"] else "N",
                     "Y" if v["supports_interactive"] else "N",
                     "Y" if backends.get(v["cli"], {}).get("installed") else "MISSING")
                    for k, v in list_models()]
            headers = ["Key", "CLI", "Model Flag", "Family", "Tier",
                       "Direct", "Interactive", "Backend"]
            _print_table(rows, headers)
        else:
            rows = [(k, v["cli"], v["model_flag"], v["description"])
                    for k, v in models_for_mode(args.mode)]
            headers = ["Key", "CLI", "Model Flag", "Description"]
            _print_table(rows, headers)

        print(f"\nBackend status:")
        for cli, info in backends.items():
            status = f"✓ {info['version']}" if info["installed"] else "✗ NOT INSTALLED"
            print(f"  {cli:10}  {status}")

    elif args.cmd == "resolve":
        try:
            spec = resolve_model(args.model_key)
            print(json.dumps(spec, indent=2))
        except ValueError as e:
            print(f"❌ {e}", file=sys.stderr)
            sys.exit(1)

    elif args.cmd == "check":
        info = check_all_backends()
        for cli, status in info.items():
            print(f"{cli}:")
            for k, v in status.items():
                print(f"  {k}: {v}")

    else:
        parser.print_help()
