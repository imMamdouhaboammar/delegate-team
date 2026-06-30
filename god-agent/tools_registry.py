"""
tools_registry.py — Local tools registry for the God Agent.

This is the Python-side registry of local tools that the God Agent (in interactive
mode) can advertise to the model. In practice, when we shell out to `opencode run`,
the model already has native access to a rich tool ecosystem via opencode itself
(file edit, grep, bash, etc.). This registry exists primarily to:

1. Document what tools the God Agent intends to expose
2. Provide a hook for callers (e.g., god_agent_interactive.py) to pre-stage local
   state (memory, skill loading) before the opencode run starts
3. Mirror the vertex-coder/tools_registry.py structure for consistency

For actual tool execution during an interactive session, prefer:
  - opencode's native tool ecosystem (file edit, bash, grep — all built-in)
  - the 1808 global skills symlinked in ~/.agents/skills/
  - explicit `load_superpower_skill` calls for methodology guidance
"""

import json
import os
import subprocess
from typing import Any, Dict, List, Optional


GOD_AGENT_MEMORY_PATH = os.environ.get(
    "GOD_AGENT_MEMORY",
    os.path.join(os.getcwd(), ".god_agent_memory.json"),
)


# ---------------------------------------------------------------------------
# Persistent local memory (mirrors vertex-coder's .agent_memory.json pattern)
# ---------------------------------------------------------------------------

def read_memories() -> str:
    """Return the memory file contents as a formatted string, or empty."""
    if not os.path.exists(GOD_AGENT_MEMORY_PATH):
        return ""
    try:
        with open(GOD_AGENT_MEMORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not data:
            return ""
        lines = ["--- LOCAL GOD AGENT MEMORIES & PREFERENCES ---"]
        for k, v in data.items():
            lines.append(f"[{k}]")
            lines.append(str(v))
            lines.append("")
        return "\n".join(lines)
    except Exception as e:
        print(f"⚠️  Failed to read God Agent memory: {e}")
        return ""


def save_memory(key: str, value: Any) -> Dict[str, Any]:
    """Save a key/value pair to local memory."""
    data = {}
    if os.path.exists(GOD_AGENT_MEMORY_PATH):
        try:
            with open(GOD_AGENT_MEMORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data[key] = value
    try:
        with open(GOD_AGENT_MEMORY_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return {"ok": True, "key": key}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Local tools inventory
# ---------------------------------------------------------------------------

# These are tools the God Agent EXPECTS to have access to during interactive
# sessions. Most are provided natively by `opencode run`; this list is a
# contract/documentation of the tool surface area.
LOCAL_TOOLS = {
    "list_dir": {
        "description": "List files and directories in the workspace",
        "provided_by": "opencode",
    },
    "read_file": {
        "description": "Read the entire content of a file",
        "provided_by": "opencode",
    },
    "write_file": {
        "description": "Create a new file or overwrite an existing one",
        "provided_by": "opencode",
    },
    "edit_file": {
        "description": "Make targeted edits to an existing file (line-based or fuzzy match)",
        "provided_by": "opencode",
    },
    "grep_search": {
        "description": "Search the workspace using regex or string query",
        "provided_by": "opencode",
    },
    "run_command": {
        "description": "Execute a bash/terminal command locally (60s timeout default)",
        "provided_by": "opencode",
        "notes": "opencode sandboxes commands by default; can be configured to allow network/install",
    },
    "add_dependency": {
        "description": "Install a package dependency (npm or pip) before importing it",
        "provided_by": "opencode (via run_command)",
    },
    "save_memory": {
        "description": "Persist a key/value pair to .god_agent_memory.json",
        "provided_by": "this registry",
        "implementation": save_memory,
    },
    "read_memories": {
        "description": "Read all persistent God Agent memories",
        "provided_by": "this registry",
        "implementation": read_memories,
    },
    "list_global_skills": {
        "description": "List all installed global skills (in ~/.agents/skills/)",
        "provided_by": "opencode",
    },
    "load_skill": {
        "description": "Load a specific skill's full instructions into the current context",
        "provided_by": "opencode",
    },
}


# ---------------------------------------------------------------------------
# Skill loading (preload into the prompt before opencode run)
# ---------------------------------------------------------------------------

def load_skill_instructions(skill_names: List[str]) -> str:
    """Load SKILL.md content for the given skill names. Returns formatted block.

    Searches:
      1. ~/.agents/skills/<name>/SKILL.md
      2. ~/.gemini/config/skills/<name>/SKILL.md
      3. ~/.mavis/skills/<name>/SKILL.md
      4. ~/.mavis/agents/mavis/skills/<name>/SKILL.md
    """
    if not skill_names:
        return ""

    search_paths = [
        os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")),
        os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills")),
        os.path.expanduser("~/.mavis/skills"),
        os.path.expanduser("~/.mavis/agents/mavis/skills"),
    ]

    loaded = []
    for name in skill_names:
        content = None
        for base in search_paths:
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
            print(f"⚠️  Skill '{name}' not found in {search_paths}")

    if not loaded:
        return ""

    return (
        "\n\n## PRE-LOADED EXPERT METHODOLOGY SKILLS\n"
        "The following skills have been pre-loaded. Apply their standards rigorously.\n\n"
        + "\n".join(loaded)
    )


# ---------------------------------------------------------------------------
# Master Tools Registry facade (parallels vertex-coder's ToolsRegistry)
# ---------------------------------------------------------------------------

class ToolsRegistry:
    """Lightweight registry mirroring vertex-coder's ToolsRegistry for parity."""

    def __init__(self, workspace: Optional[str] = None):
        self.workspace = workspace or os.getcwd()
        self.loaded_skills: List[str] = []

    def get_tool_names(self) -> List[str]:
        return list(LOCAL_TOOLS.keys())

    def get_tool_descriptions(self) -> Dict[str, str]:
        return {k: v["description"] for k, v in LOCAL_TOOLS.items()}

    def execute_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool that this registry owns (save_memory, read_memories).
        Most tools are executed by opencode itself during interactive sessions.
        """
        if name == "save_memory":
            key = arguments.get("key")
            value = arguments.get("value")
            if not key:
                return {"ok": False, "error": "missing 'key'"}
            return save_memory(key, value)
        if name == "read_memories":
            return {"ok": True, "content": read_memories()}
        return {"ok": False, "error": f"Tool '{name}' is executed by opencode runtime, not this registry"}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="God Agent Tools Registry")
    sub = parser.add_subparsers(dest="cmd")

    p_list = sub.add_parser("list", help="List local tools exposed to the agent")

    p_load = sub.add_parser("load-skill", help="Pre-load skill instructions (preview)")
    p_load.add_argument("skills", nargs="+")

    p_mem = sub.add_parser("memory", help="Show persistent God Agent memories")

    args = parser.parse_args()

    if args.cmd == "list":
        print(f"\n🛠️  God Agent Local Tools ({len(LOCAL_TOOLS)})\n")
        for name, meta in LOCAL_TOOLS.items():
            print(f"  {name:25}  [{meta['provided_by']}]")
            print(f"     └─ {meta['description']}")
        print()

    elif args.cmd == "load-skill":
        content = load_skill_instructions(args.skills)
        print(content or "(no skills loaded)")

    elif args.cmd == "memory":
        print(read_memories() or "(no memories)")
