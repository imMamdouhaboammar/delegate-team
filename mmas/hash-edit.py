#!/usr/bin/env python3
"""
hash-edit.py — Hash-Anchored Edit Tool (LINE#ID)

Inspired by oh-my-openagent's hashline pattern. Inspired by Can Bölük's "The Harness Problem":
most agent failures aren't the model's fault — they're the edit tool's fault, because they
require the model to reproduce content it already saw (and often can't).

This tool gives every line a content hash. The agent edits by referencing the hash; if the file
changed since the last read, the hash won't match and the edit is rejected BEFORE corruption.

Format: `LINE#HASH | content` where HASH = first 2 chars of SHA256(content)

Usage:
    python3 hash-edit.py read <file>                              # show all lines with hashes
    python3 hash-edit.py read <file> --lines 10-20               # show specific range
    python3 hash-edit.py edit <file> LINE#HASH "<new_content>"   # replace single line
    python3 hash-edit.py insert <file> LINE#HASH "<new_content>"  # insert before line
    python3 hash-edit.py delete <file> LINE#HASH                   # delete single line
    python3 hash-edit.py validate <file>                          # check file integrity

Examples:
    python3 hash-edit.py read src/app.py
    python3 hash-edit.py edit src/app.py 11#VK 'def hello() -> str:'
    python3 hash-edit.py insert src/app.py 22#XJ '    return "world"'
"""

import argparse
import hashlib
import os
import sys


HASH_PREFIX_LEN = 2


def line_hash(content: str) -> str:
    """Compute the hash prefix for a line."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:HASH_PREFIX_LEN]


def format_line(line_no: int, content: str) -> str:
    """Format a line with its hash for display."""
    h = line_hash(content)
    return f"{line_no:>4}#{h}| {content}"


def read_file_with_hashes(file_path: str, line_range: tuple = None) -> list:
    """Read file and return list of (line_no, hash, content) tuples."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    if line_range:
        start, end = line_range
        lines = lines[start - 1:end]
        line_offset = start - 1
    else:
        line_offset = 0

    return [
        (line_offset + i + 1, line_hash(line), line)
        for i, line in enumerate(lines)
    ]


def display_lines(lines: list, file_path: str):
    """Print lines with hash format."""
    print(f"# {file_path}")
    for line_no, h, content in lines:
        print(format_line(line_no, content))


def validate_line(file_path: str, line_no: int, expected_hash: str) -> tuple:
    """Check if a line still matches its hash.

    Returns: (matches: bool, current_content: str)
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.read().split("\n")
    except FileNotFoundError:
        return False, None

    if line_no < 1 or line_no > len(lines):
        return False, None

    current_content = lines[line_no - 1]
    current_hash = line_hash(current_content)
    matches = (current_hash == expected_hash)
    return matches, current_content


def edit_line(file_path: str, line_no: int, expected_hash: str, new_content: str) -> dict:
    """Replace a single line if hash matches.

    Returns: {"ok": bool, "error": str (if not ok), "diff": str (if ok)}
    """
    # Validate hash
    matches, current_content = validate_line(file_path, line_no, expected_hash)
    if not matches:
        current_hash = line_hash(current_content) if current_content else "<missing>"
        return {
            "ok": False,
            "error": (
                f"Hash mismatch at line {line_no}.\n"
                f"  expected: #{expected_hash}\n"
                f"  current:  #{current_hash}\n"
                f"File changed since last read. Re-read with `hash-edit.py read` and retry."
            ),
        }

    # Read full file
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    # Replace
    old_content = lines[line_no - 1]
    lines[line_no - 1] = new_content
    new_file_content = "\n".join(lines)

    # Write back
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_file_content)

    # Generate diff
    diff = (
        f"--- a/{file_path}\n"
        f"+++ b/{file_path}\n"
        f"@@ -{line_no},1 +{line_no},1 @@\n"
        f"-{old_content}\n"
        f"+{new_content}"
    )

    return {"ok": True, "diff": diff, "line_no": line_no}


def insert_line(file_path: str, line_no: int, expected_hash: str, new_content: str) -> dict:
    """Insert a new line BEFORE the given line if hash matches."""
    matches, _ = validate_line(file_path, line_no, expected_hash)
    if not matches:
        current_hash = line_hash(_) if _ else "<missing>"
        return {
            "ok": False,
            "error": (
                f"Hash mismatch at line {line_no} (insert anchor).\n"
                f"  expected: #{expected_hash}\n"
                f"  current:  #{current_hash}"
            ),
        }

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    lines.insert(line_no - 1, new_content)
    new_file_content = "\n".join(lines)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_file_content)

    return {"ok": True, "inserted_at": line_no, "content": new_content}


def delete_line(file_path: str, line_no: int, expected_hash: str) -> dict:
    """Delete a line if hash matches."""
    matches, old_content = validate_line(file_path, line_no, expected_hash)
    if not matches:
        current_hash = line_hash(old_content) if old_content else "<missing>"
        return {
            "ok": False,
            "error": (
                f"Hash mismatch at line {line_no}.\n"
                f"  expected: #{expected_hash}\n"
                f"  current:  #{current_hash}"
            ),
        }

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")

    deleted = lines.pop(line_no - 1)
    new_file_content = "\n".join(lines)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_file_content)

    return {"ok": True, "deleted_at": line_no, "content": deleted}


def parse_line_spec(spec: str) -> tuple:
    """Parse 'LINE#HASH' format. Returns (line_no: int, hash: str)."""
    if "#" not in spec:
        raise ValueError(f"Invalid line spec '{spec}'. Expected format: 'LINE#HASH' (e.g. '11#VK')")
    line_str, hash_str = spec.split("#", 1)
    try:
        line_no = int(line_str)
    except ValueError:
        raise ValueError(f"Invalid line number '{line_str}' in '{spec}'")
    return line_no, hash_str


def cmd_read(args):
    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}", file=sys.stderr)
        return 1
    line_range = None
    if args.lines:
        try:
            parts = args.lines.split("-")
            start = int(parts[0])
            end = int(parts[1]) if len(parts) > 1 else start
            line_range = (start, end)
        except Exception as e:
            print(f"❌ Invalid --lines format '{args.lines}': {e}", file=sys.stderr)
            return 1
    lines = read_file_with_hashes(args.file, line_range)
    display_lines(lines, args.file)
    return 0


def cmd_validate(args):
    """Check if all hashes are consistent (no integrity check across, just sanity)."""
    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}", file=sys.stderr)
        return 1
    lines = read_file_with_hashes(args.file)
    print(f"✅ {args.file} has {len(lines)} lines, all hashed successfully.")
    return 0


def cmd_edit(args):
    try:
        line_no, expected_hash = parse_line_spec(args.line_spec)
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}", file=sys.stderr)
        return 1
    result = edit_line(args.file, line_no, expected_hash, args.new_content)
    if not result["ok"]:
        print(f"❌ {result['error']}", file=sys.stderr)
        return 1
    print(f"✅ Edited {args.file}:{line_no}")
    print(result.get("diff", ""))
    return 0


def cmd_insert(args):
    try:
        line_no, expected_hash = parse_line_spec(args.line_spec)
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}", file=sys.stderr)
        return 1
    result = insert_line(args.file, line_no, expected_hash, args.new_content)
    if not result["ok"]:
        print(f"❌ {result['error']}", file=sys.stderr)
        return 1
    print(f"✅ Inserted at {args.file}:{line_no}")
    return 0


def cmd_delete(args):
    try:
        line_no, expected_hash = parse_line_spec(args.line_spec)
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}", file=sys.stderr)
        return 1
    result = delete_line(args.file, line_no, expected_hash)
    if not result["ok"]:
        print(f"❌ {result['error']}", file=sys.stderr)
        return 1
    print(f"✅ Deleted {args.file}:{line_no}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Hash-Anchored Edit Tool — LINE#HASH content-hash validation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # read
    p_read = sub.add_parser("read", help="Show file lines with hashes")
    p_read.add_argument("file")
    p_read.add_argument("--lines", help="Line range, e.g. '10-20'")
    p_read.set_defaults(func=cmd_read)

    # validate
    p_val = sub.add_parser("validate", help="Check file integrity")
    p_val.add_argument("file")
    p_val.set_defaults(func=cmd_validate)

    # edit
    p_edit = sub.add_parser("edit", help="Replace a single line (hash-validated)")
    p_edit.add_argument("file")
    p_edit.add_argument("line_spec", help="LINE#HASH, e.g. '11#VK'")
    p_edit.add_argument("new_content")
    p_edit.set_defaults(func=cmd_edit)

    # insert
    p_ins = sub.add_parser("insert", help="Insert before a line (hash-validated)")
    p_ins.add_argument("file")
    p_ins.add_argument("line_spec")
    p_ins.add_argument("new_content")
    p_ins.set_defaults(func=cmd_insert)

    # delete
    p_del = sub.add_parser("delete", help="Delete a line (hash-validated)")
    p_del.add_argument("file")
    p_del.add_argument("line_spec")
    p_del.set_defaults(func=cmd_delete)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
