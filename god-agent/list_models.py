#!/usr/bin/env python3
"""
list_models.py — Show God Agent models with availability status.

Usage:
    python3 list_models.py                # all models
    python3 list_models.py --mode direct  # direct-mode only
    python3 list_models.py --mode interactive
    python3 list_models.py --json         # machine-readable
"""

import argparse
import json
import os
import sys

try:
    from model_router import MODEL_REGISTRY, check_all_backends, models_for_mode
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from model_router import MODEL_REGISTRY, check_all_backends, models_for_mode


def render_table(rows, headers):
    widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    sep = "  "
    print(sep.join(h.ljust(widths[i]) for i, h in enumerate(headers)))
    print(sep.join("-" * widths[i] for i in range(len(headers))))
    for row in rows:
        print(sep.join(str(row[i]).ljust(widths[i]) for i in range(len(headers))))


def main():
    parser = argparse.ArgumentParser(description="List God Agent models")
    parser.add_argument("--mode", choices=["direct", "interactive", "all"], default="all")
    parser.add_argument("--json", action="store_true", help="Machine-readable JSON output")
    args = parser.parse_args()

    backends = check_all_backends()

    if args.json:
        out = {
            "backends": backends,
            "models": [
                {**v, "key": k, "backend_installed": backends.get(v["cli"], {}).get("installed", False)}
                for k, v in MODEL_REGISTRY.items()
            ],
        }
        print(json.dumps(out, indent=2))
        return 0

    print("\n🤖  God Agent Model Registry\n")

    if args.mode == "all":
        rows = []
        for k, v in sorted(MODEL_REGISTRY.items()):
            installed = backends.get(v["cli"], {}).get("installed", False)
            rows.append((
                k, v["cli"], v["model_flag"], v["family"], v["tier"],
                "Y" if v["supports_direct"] else "-",
                "Y" if v["supports_interactive"] else "-",
                "✓" if installed else "✗",
            ))
        render_table(rows, ["Key", "CLI", "Model Flag", "Family", "Tier",
                            "Direct", "Interactive", "Backend"])
    else:
        rows = [(k, v["cli"], v["model_flag"], v["tier"], v["description"])
                for k, v in models_for_mode(args.mode)]
        render_table(rows, ["Key", "CLI", "Model Flag", "Tier", "Description"])

    print("\n📦 Backend CLI status:")
    for cli, info in backends.items():
        if info["installed"]:
            print(f"  ✓ {cli:10}  {info['version']:20}  {info['path']}")
        else:
            print(f"  ✗ {cli:10}  NOT INSTALLED")

    print("\n💡 Usage:")
    print("  Direct mode:    python3 god_agent_direct.py <file> <prompt> <model-key>")
    print("  Interactive:    python3 god_agent_interactive.py <prompt> <model-key>")
    print("  Health check:   python3 inspect_settings.py\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
