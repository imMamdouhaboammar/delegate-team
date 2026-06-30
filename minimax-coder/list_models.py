#!/usr/bin/env python3
"""
list_models.py — Show MiniMax Coder models.

Usage:
    python3 list_models.py                # all models
    python3 list_models.py --json         # machine-readable
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from minimax_direct_coder import MODEL_REGISTRY, DEFAULT_MODEL


def render_table(rows, headers):
    widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0))
              for i, h in enumerate(headers)]
    sep = "  "
    print(sep.join(h.ljust(widths[i]) for i, h in enumerate(headers)))
    print(sep.join("-" * widths[i] for i in range(len(headers))))
    for row in rows:
        print(sep.join(str(row[i]).ljust(widths[i]) for i in range(len(headers))))


def main():
    parser = argparse.ArgumentParser(description="List MiniMax Coder models")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    if args.json:
        print(json.dumps({
            "default_model": DEFAULT_MODEL,
            "transport": "mmx CLI (https://github.com/MiniMax-AI/cli)",
            "models": MODEL_REGISTRY,
        }, indent=2))
        return 0

    print("\n🤖  MiniMax Coder Models\n")
    print(f"🔗 Transport: mmx CLI (https://github.com/MiniMax-AI/cli)")
    print(f"⭐ Default model: {DEFAULT_MODEL}\n")

    rows = [(name, meta["description"][:60]) for name, meta in sorted(MODEL_REGISTRY.items())]
    render_table(rows, ["Model", "Description"])

    print("\n💡 Usage:")
    print(f"  Direct:        python3 minimax_direct_coder.py <file> <prompt> {DEFAULT_MODEL}")
    print(f"  Interactive:   python3 minimax_interactive_agent.py <prompt> {DEFAULT_MODEL} --skills tdd")
    print(f"  mmx direct:    mmx text chat --model {DEFAULT_MODEL} --message 'Hello'")
    print(f"  Health check:  python3 inspect_settings.py\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
