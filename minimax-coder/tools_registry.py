"""
tools_registry.py — Local tools registry for MiniMax Coder (mmx transport).

Mirrors vertex-coder/tools_registry.py but exposes tools as Anthropic-format
JSON schemas for the `mmx` CLI tool-use API (which is Anthropic-compatible).

Tool categories:
1. Anthropic-format tools: line_replace, grep_search, run_command, etc.
   Exposed to the model via mmx `--tool <json-or-path>` flags.
2. Internal tools: save_memory, read_memories, list_global_skills, load_skill.
   Implemented in Python and called by the agent loop directly.

Persistent memory file: .agent_memory.json (same name as vertex-coder for parity).
"""

import json
import os
import re
import shlex
import subprocess
from typing import Any, Dict, List, Optional


AGENT_MEMORY_PATH = os.environ.get(
    "AGENT_MEMORY",
    os.path.join(os.getcwd(), ".agent_memory.json"),
)

# Locations to search when loading skills
SKILL_SEARCH_PATHS = [
    os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")),
    os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills")),
    os.path.expanduser("~/.apeiron/skills"),
    os.path.expanduser("~/.minimax/skills"),
    os.path.expanduser("~/.apeiron/agents/apeiron/skills"),
]


# ---------------------------------------------------------------------------
# Persistent local memory
# ---------------------------------------------------------------------------

def read_memories() -> str:
    if not os.path.exists(AGENT_MEMORY_PATH):
        return ""
    try:
        with open(AGENT_MEMORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not data:
            return ""
        lines = ["--- LOCAL AGENT MEMORIES & PREFERENCES ---"]
        for k, v in data.items():
            lines.append(f"[{k}]")
            lines.append(str(v))
            lines.append("")
        return "\n".join(lines)
    except Exception as e:
        print(f"⚠️  Failed to read agent memory: {e}")
        return ""


def save_memory(key: str, value: Any) -> Dict[str, Any]:
    data = {}
    if os.path.exists(AGENT_MEMORY_PATH):
        try:
            with open(AGENT_MEMORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data[key] = value
    try:
        with open(AGENT_MEMORY_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return {"ok": True, "key": key}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Local tool implementations (used by the interactive agent loop)
# ---------------------------------------------------------------------------

def tool_list_dir(path: str = ".") -> str:
    try:
        entries = sorted(os.listdir(path))
        return "\n".join(entries) if entries else "(empty directory)"
    except Exception as e:
        return f"Error: {e}"


def tool_read_file(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error: {e}"


def tool_write_file(file_path: str, content: str) -> str:
    try:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"OK: wrote {len(content)} chars to {file_path}"
    except Exception as e:
        return f"Error: {e}"


def tool_line_replace(file_path: str, first_replaced_line: int,
                       last_replaced_line: int, replacement: str) -> str:
    """Replace a range of lines (1-indexed, inclusive). Use '...' on its own line
    in `replacement` to preserve the original line at that position."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            original = f.read()
        lines = original.split("\n")

        if first_replaced_line < 1 or last_replaced_line > len(lines):
            return f"Error: line range [{first_replaced_line},{last_replaced_line}] out of bounds (file has {len(lines)} lines)"
        if first_replaced_line > last_replaced_line:
            return f"Error: first_replaced_line ({first_replaced_line}) > last_replaced_line ({last_replaced_line})"

        replacement_lines = replacement.split("\n")
        new_lines = []
        for i, line in enumerate(replacement_lines):
            if line.strip() == "..." or line.strip() == "# ... keep existing code":
                original_line_idx = first_replaced_line - 1 + i
                if 0 <= original_line_idx < len(lines):
                    new_lines.append(lines[original_line_idx])
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)

        new_content_lines = lines[:first_replaced_line - 1] + new_lines + lines[last_replaced_line:]
        new_content = "\n".join(new_content_lines)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        return f"OK: replaced lines {first_replaced_line}-{last_replaced_line} in {file_path}"
    except Exception as e:
        return f"Error: {e}"


def tool_grep_search(pattern: str, path: str = ".", file_pattern: str = None,
                      case_insensitive: bool = True) -> str:
    flags = re.IGNORECASE if case_insensitive else 0
    try:
        regex = re.compile(pattern, flags)
    except re.error as e:
        return f"Invalid regex: {e}"

    results = []
    try:
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv", "__pycache__", "dist"}]
            for fname in files:
                if file_pattern and not re.search(file_pattern, fname):
                    continue
                full_path = os.path.join(root, fname)
                try:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        for line_no, line in enumerate(f, 1):
                            if regex.search(line):
                                results.append(f"{full_path}:{line_no}: {line.rstrip()}")
                                if len(results) >= 200:
                                    results.append("... (truncated at 200 matches)")
                                    return "\n".join(results)
                except Exception:
                    continue
    except Exception as e:
        return f"Error: {e}"

    if not results:
        return f"No matches for pattern '{pattern}' in {path}"
    return "\n".join(results)


def tool_run_command(command: str, timeout: int = 60) -> str:
    """Run a bounded workspace command without invoking a shell by default."""
    allowlist = [
        "npm test", "npm run build", "npm run typecheck",
        "pytest", "python -m pytest", "python3 -m pytest",
        "git status", "git diff", "node --version",
        "python --version", "python3 --version",
    ]
    command_lower = command.strip().lower()
    allow_unsafe = os.environ.get("DT_ALLOW_UNSAFE_COMMANDS") == "true"
    is_allowed = any(
        command_lower == allowed or command_lower.startswith(allowed + " ")
        for allowed in allowlist
    )
    if not is_allowed and not allow_unsafe:
        return (
            f"Security Error: Command '{command}' is not in the allowlist. "
            "Set DT_ALLOW_UNSAFE_COMMANDS=true only after explicit approval."
        )

    hard_denylist = [
        "rm -rf /", "rm -rf .", "git reset --hard", "shutdown",
        "reboot", "mkfs", "dd ",
    ]
    if any(blocked in command_lower for blocked in hard_denylist):
        return "Security Error: Command rejected by hard denylist."

    try:
        args = ["bash", "-lc", command] if allow_unsafe and not is_allowed else shlex.split(command)
        result = subprocess.run(
            args,
            shell=False,
            capture_output=True,
            text=True,
            timeout=max(1, min(timeout, 300)),
        )
        output = ""
        if result.stdout:
            output += f"--- stdout ---\n{result.stdout.rstrip()}\n"
        if result.stderr:
            output += f"--- stderr ---\n{result.stderr.rstrip()}\n"
        output += f"--- exit code: {result.returncode} ---"
        return output[:5000]
    except (ValueError, OSError) as e:
        return f"Error: invalid command: {e}"
    except subprocess.TimeoutExpired:
        return f"Error: command timed out after {timeout}s"


def tool_list_global_skills() -> str:
    found = {}
    for base in SKILL_SEARCH_PATHS:
        if not os.path.isdir(base):
            continue
        try:
            for entry in sorted(os.listdir(base)):
                skill_md = os.path.join(base, entry, "SKILL.md")
                if os.path.exists(skill_md):
                    found[entry] = base
        except Exception:
            continue
    if not found:
        return "No skills found in: " + ", ".join(SKILL_SEARCH_PATHS)
    lines = [f"--- GLOBAL SKILLS ({len(found)}) ---"]
    for name, base in sorted(found.items()):
        lines.append(f"  {name}  [{base}]")
    return "\n".join(lines)


def tool_load_skill(skill_name: str) -> str:
    for base in SKILL_SEARCH_PATHS:
        skill_md = os.path.join(base, skill_name, "SKILL.md")
        if os.path.exists(skill_md):
            try:
                with open(skill_md, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                return f"Error reading {skill_md}: {e}"
    return f"Skill '{skill_name}' not found in any of: {SKILL_SEARCH_PATHS}"


# ---------------------------------------------------------------------------
# Tool registry — Anthropic-format schemas (consumed by mmx via --tool)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "list_dir",
        "description": "List files and subdirectories in a directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (default: current dir)"},
            },
        },
        "implementation": tool_list_dir,
    },
    {
        "name": "read_file",
        "description": "Read the entire content of a file.",
        "input_schema": {
            "type": "object",
            "properties": {"file_path": {"type": "string"}},
            "required": ["file_path"],
        },
        "implementation": tool_read_file,
    },
    {
        "name": "write_file",
        "description": "Create a new file or overwrite an existing one. Use sparingly — prefer line_replace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["file_path", "content"],
        },
        "implementation": tool_write_file,
    },
    {
        "name": "line_replace",
        "description": (
            "PREFERRED tool for editing existing files. Replace a range of lines (1-indexed, "
            "inclusive) with new content. Use '...' on its own line in the replacement to "
            "preserve original lines at that position. Always prefer this over write_file."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "first_replaced_line": {"type": "integer", "minimum": 1},
                "last_replaced_line": {"type": "integer", "minimum": 1},
                "replacement": {"type": "string"},
            },
            "required": ["file_path", "first_replaced_line", "last_replaced_line", "replacement"],
        },
        "implementation": tool_line_replace,
    },
    {
        "name": "grep_search",
        "description": "Search the workspace for a regex pattern. Returns matching lines with file:line:content format.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string"},
                "path": {"type": "string"},
                "file_pattern": {"type": "string"},
                "case_insensitive": {"type": "boolean", "default": True},
            },
            "required": ["pattern"],
        },
        "implementation": tool_grep_search,
    },
    {
        "name": "run_command",
        "description": "Execute a bash command locally. Use for tests, builds, installs, git, etc. Default timeout: 60s.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "timeout": {"type": "integer", "default": 60, "minimum": 1, "maximum": 300},
            },
            "required": ["command"],
        },
        "implementation": tool_run_command,
    },
    {
        "name": "save_memory",
        "description": "Persist a key/value pair to .agent_memory.json. Survives across sessions.",
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string"}, "value": {"type": "string"}},
            "required": ["key", "value"],
        },
        "implementation": lambda **kw: save_memory(kw["key"], kw["value"]),
    },
    {
        "name": "read_memories",
        "description": "Read all persistent agent memories.",
        "input_schema": {"type": "object", "properties": {}},
        "implementation": lambda **kw: read_memories(),
    },
    {
        "name": "list_global_skills",
        "description": "List all available global skills (methodology guides).",
        "input_schema": {"type": "object", "properties": {}},
        "implementation": tool_list_global_skills,
    },
    {
        "name": "load_skill",
        "description": "Load a specific skill's full instructions into the current context.",
        "input_schema": {
            "type": "object",
            "properties": {"skill_name": {"type": "string"}},
            "required": ["skill_name"],
        },
        "implementation": tool_load_skill,
    },
]


def get_anthropic_tools() -> List[dict]:
    """Return tools in Anthropic API format (without implementation refs)."""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOLS
    ]


def write_tool_files(tmp_dir: str) -> List[str]:
    """Write each tool to a JSON file in tmp_dir. Return list of file paths.

    mmx accepts `--tool <path-to-json-file>` for tool definitions.
    """
    os.makedirs(tmp_dir, exist_ok=True)
    paths = []
    for t in TOOLS:
        path = os.path.join(tmp_dir, f"{t['name']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"],
            }, f, indent=2)
        paths.append(path)
    return paths


# ---------------------------------------------------------------------------
# Master Tools Registry facade
# ---------------------------------------------------------------------------

class ToolsRegistry:
    def __init__(self):
        self._tools_by_name = {t["name"]: t for t in TOOLS}

    def get_tool_names(self) -> List[str]:
        return list(self._tools_by_name.keys())

    def get_anthropic_tools(self) -> List[dict]:
        return get_anthropic_tools()

    def execute_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        if name not in self._tools_by_name:
            return f"Error: unknown tool '{name}'"
        tool = self._tools_by_name[name]
        try:
            return tool["implementation"](**arguments)
        except TypeError as e:
            return f"Error: invalid arguments for tool '{name}': {e}"
        except Exception as e:
            return f"Error executing '{name}': {e}"


# ---------------------------------------------------------------------------
# Skill preload
# ---------------------------------------------------------------------------

def load_skill_instructions(skill_names: List[str]) -> str:
    if not skill_names:
        return ""
    loaded = []
    for name in skill_names:
        content = None
        for base in SKILL_SEARCH_PATHS:
            path = os.path.join(base, name, "SKILL.md")
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    break
                except Exception:
                    pass
        if content:
            loaded.append(
                f"### SKILL: {name}\n"
                f"Apply the following expert guidelines to your work:\n\n"
                f"{content}\n"
                f"----------------------------------------\n"
            )
        else:
            print(f"⚠️  Skill '{name}' not found in {SKILL_SEARCH_PATHS}")
    if not loaded:
        return ""
    return (
        "\n\n## PRE-LOADED EXPERT METHODOLOGY SKILLS\n"
        "The following skills have been pre-loaded. Apply their standards rigorously.\n\n"
        + "\n".join(loaded)
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="MiniMax Coder Tools Registry (mmx transport)")
    sub = parser.add_subparsers(dest="cmd")

    p_list = sub.add_parser("list", help="List all registered tools")
    p_schemas = sub.add_parser("schemas", help="Print Anthropic-format tool schemas (JSON)")
    p_write = sub.add_parser("write-files", help="Write each tool to a JSON file (for mmx --tool)")
    p_write.add_argument("--out-dir", required=True)

    args = parser.parse_args()

    if args.cmd == "list":
        print(f"\n🛠️  MiniMax Coder Local Tools ({len(TOOLS)})\n")
        for t in TOOLS:
            print(f"  {t['name']:22}  — {t['description'][:80]}")
        print()
    elif args.cmd == "schemas":
        print(json.dumps(get_anthropic_tools(), indent=2))
    elif args.cmd == "write-files":
        paths = write_tool_files(args.out_dir)
        print(f"Wrote {len(paths)} tool definition files to {args.out_dir}:")
        for p in paths:
            print(f"  - {p}")
    else:
        parser.print_help()
