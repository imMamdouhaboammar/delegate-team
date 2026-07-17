#!/usr/bin/env python3
import os

# Define case-sensitive replacements to make
REPLACEMENTS = [
    # Hyphenated
    ("god-agent", "aonios-agent"),
    ("God-Agent", "Aonios-Agent"),
    ("God-agent", "Aonios-agent"),
    ("GOD-AGENT", "AONIOS-AGENT"),
    
    # Underscored
    ("god_agent", "aonios_agent"),
    ("God_Agent", "Aonios_Agent"),
    ("GOD_AGENT", "AONIOS_AGENT"),
    
    # Spaced
    ("god agent", "aonios agent"),
    ("God Agent", "Aonios Agent"),
    ("GOD AGENT", "AONIOS AGENT"),

    # Direct concatenation
    ("godagent", "aoniosagent"),
    ("GodAgent", "AoniosAgent"),
    ("GODAGENT", "AONIOSAGENT"),
]

EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    "dist",
    ".venv",
    "__pycache__",
    ".gemini",
    "local_cache",
}

EXCLUDE_FILES = {
    ".DS_Store",
    "rename_agent.py", # Exclude this script itself
}

def replace_in_content(content: str) -> str:
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
    return content

def rename_string(name: str) -> str:
    for old, new in REPLACEMENTS:
        name = name.replace(old, new)
    return name

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(f"Starting rebrand from god-agent to aonios-agent in: {root_dir}")
    
    # Phase 1: Replace text in file contents
    print("\nPhase 1: Replacing text inside files...")
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Prune excluded directories in place
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        
        for filename in filenames:
            if filename in EXCLUDE_FILES:
                continue
            
            filepath = os.path.join(dirpath, filename)
            
            # Read file content (try utf-8, ignore errors for binary files)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
            except (UnicodeDecodeError, IOError):
                # Binary file or read error, skip
                continue
                
            new_content = replace_in_content(content)
            
            if new_content != content:
                print(f"Updating file contents: {os.path.relpath(filepath, root_dir)}")
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                    
    # Phase 2: Rename files and directories
    print("\nPhase 2: Renaming files and directories...")
    # Use topdown=False so we rename deepest children first
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        # Prune excluded directories
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        
        # Rename files first
        for filename in filenames:
            if filename in EXCLUDE_FILES:
                continue
                
            new_filename = rename_string(filename)
            if new_filename != filename:
                old_path = os.path.join(dirpath, filename)
                new_path = os.path.join(dirpath, new_filename)
                print(f"Renaming file: {os.path.relpath(old_path, root_dir)} -> {os.path.relpath(new_path, root_dir)}")
                os.rename(old_path, new_path)
                
        # Rename directories
        for dirname in dirnames:
            new_dirname = rename_string(dirname)
            if new_dirname != dirname:
                old_path = os.path.join(dirpath, dirname)
                new_path = os.path.join(dirpath, new_dirname)
                print(f"Renaming directory: {os.path.relpath(old_path, root_dir)} -> {os.path.relpath(new_path, root_dir)}")
                os.rename(old_path, new_path)
                
    print("\nRebrand complete!")

if __name__ == "__main__":
    main()
