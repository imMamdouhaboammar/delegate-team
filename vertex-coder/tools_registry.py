import os
import json
import subprocess
import threading
from google.genai import types

# Default project and location config loading
def load_global_config():
    config_path = os.path.expanduser("~/.config/dt/config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

config_data = load_global_config()
project_id = config_data.get("project_id", os.environ.get("GOOGLE_CLOUD_PROJECT"))
location = config_data.get("location", "us-central1")

def get_gcloud_credentials():
    try:
        from google.oauth2.credentials import Credentials
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"], 
            text=True
        ).strip()
        return Credentials(token)
    except Exception as e:
        print(f"Failed to fetch credentials from gcloud: {e}")
        return None

# =====================================================================
# 1. MCP Process Client (STDIO JSON-RPC)
# =====================================================================

class MCPProcessClient:
    def __init__(self, name: str, command: str, args: list):
        self.name = name
        self.command = command
        self.args = args
        self.process = None
        self.id_counter = 1
        self.tools = []
        
    def start(self):
        cmd = [self.command] + self.args
        print(f"🔌 [MCP] Starting server '{self.name}': {' '.join(cmd)}")
        try:
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                encoding='utf-8'
            )
            # Run a thread to clear stderr to prevent blocking
            threading.Thread(target=self._log_stderr, daemon=True).start()
            
            # Handshake
            self._initialize()
            print(f" -> Server '{self.name}' initialized successfully.")
            return True
        except Exception as e:
            print(f" -> Error starting MCP server '{self.name}': {e}")
            return False
            
    def _log_stderr(self):
        while self.process and self.process.poll() is None:
            try:
                line = self.process.stderr.readline()
                if not line:
                    break
                # Only show error logs from MCP to avoid clutter
                if "error" in line.lower() or "fail" in line.lower():
                    print(f" [{self.name}-err] {line.strip()}")
            except Exception:
                break
                
    def _send_request(self, method: str, params: dict = None) -> dict:
        if not self.process or self.process.poll() is not None:
            raise RuntimeError(f"MCP Server '{self.name}' is not running.")
            
        req_id = self.id_counter
        self.id_counter += 1
        
        req = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method
        }
        if params is not None:
            req["params"] = params
            
        req_str = json.dumps(req) + "\n"
        try:
            self.process.stdin.write(req_str)
            self.process.stdin.flush()
            
            res_str = self.process.stdout.readline()
            if not res_str:
                raise RuntimeError("Connection closed by server.")
                
            return json.loads(res_str)
        except Exception as e:
            raise RuntimeError(f"Error in JSON-RPC communication with '{self.name}': {e}")
            
    def _initialize(self):
        # initialize
        self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "VertexInteractiveClient",
                "version": "1.0.0"
            }
        })
        # notification
        notif = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        self.process.stdin.write(json.dumps(notif) + "\n")
        self.process.stdin.flush()
        
    def fetch_tools(self) -> list:
        try:
            res = self._send_request("tools/list")
            self.tools = res.get("result", {}).get("tools", [])
            return self.tools
        except Exception as e:
            print(f" -> Failed to fetch tools from '{self.name}': {e}")
            return []
            
    def call_tool(self, name: str, arguments: dict) -> dict:
        try:
            res = self._send_request("tools/call", {
                "name": name,
                "arguments": arguments
            })
            return res.get("result", {})
        except Exception as e:
            return {"isError": True, "content": [{"type": "text", "text": f"Error calling MCP tool: {e}"}]}
            
    def stop(self):
        if self.process:
            print(f"🔌 [MCP] Stopping server '{self.name}'...")
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass

# =====================================================================
# 2. Global Skills Integration
# =====================================================================

def list_global_skills() -> str:
    """Lists all available global agent skills on your macOS and their descriptions."""
    paths = [
        os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")),
        os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills"))
    ]
    skills = {}
    for p in paths:
        if os.path.exists(p):
            for item in os.listdir(p):
                full_item_path = os.path.join(p, item)
                if os.path.isdir(full_item_path):
                    skill_md_path = os.path.join(full_item_path, "SKILL.md")
                    if os.path.exists(skill_md_path):
                        try:
                            with open(skill_md_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                            # Try to extract description from frontmatter
                            desc = "No description available."
                            if content.startswith("---"):
                                parts = content.split("---", 2)
                                if len(parts) >= 3:
                                    fm = parts[1]
                                    for line in fm.split("\n"):
                                        if line.strip().startswith("description:"):
                                            desc = line.split(":", 1)[1].strip()
                                            break
                            skills[item] = desc
                        except Exception:
                            pass
    output = []
    for s_name, s_desc in sorted(skills.items()):
        output.append(f"- **{s_name}**: {s_desc}")
    return "\n".join(output) if output else "No global skills found."

def use_global_skill(skill_name: str, task: str) -> str:
    """Loads and executes a global skill's instructions on a specific task/query.

    Args:
        skill_name: The name of the global skill (e.g. 'firebase-basics', 'code-simplification').
        task: The specific task or code query to process using that skill's rules.
    """
    print(f"\n[Tool Execution] use_global_skill(skill_name='{skill_name}', task_len={len(task)})")
    paths_to_check = [
        os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")) + f"/{skill_name}/SKILL.md",
        os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills")) + f"/{skill_name}/SKILL.md"
    ]
    skill_content = ""
    for path in paths_to_check:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    skill_content = f.read()
                break
            except Exception:
                pass
                
    if not skill_content:
        return f"Error: Global skill '{skill_name}' not found or unreadable."
        
    print(f" -> Loaded SKILL.md for '{skill_name}' ({len(skill_content)} characters). Creating nested Gemini context...")
    
    try:
        from google import genai
        creds = get_gcloud_credentials()
        client = genai.Client(
            vertexai=True,
            project=project_id,
            location="global",
            credentials=creds,
            http_options=types.HttpOptions(headers={"x-goog-user-project": project_id})
        )
        
        config = types.GenerateContentConfig(
            system_instruction=f"You are executing the global skill: {skill_name}.\nFollow these instructions precisely:\n\n{skill_content}",
            temperature=0.2
        )
        
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=task,
            config=config
        )
        print(" -> Nested skill execution complete.")
        return response.text
    except Exception as e:
        return f"Error executing nested skill '{skill_name}': {str(e)}"

def load_superpower_skill(skill_name: str) -> str:
    """Loads a global skill's full instructions (SKILL.md) directly into the agent's context.

    Args:
        skill_name: The name of the global skill (e.g. 'test-driven-development', 'graphify', 'doubt-driven-development').
    """
    print(f"\n[Tool Execution] load_superpower_skill(skill_name='{skill_name}')")
    paths_to_check = [
        os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")) + f"/{skill_name}/SKILL.md",
        os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills")) + f"/{skill_name}/SKILL.md"
    ]
    skill_content = ""
    for path in paths_to_check:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    skill_content = f.read()
                break
            except Exception:
                pass
                
    if not skill_content:
        return f"Error: Global skill '{skill_name}' not found or unreadable."
        
    return f"--- SKILL INSTRUCTIONS FOR {skill_name} ---\n{skill_content}\n--- END SKILL INSTRUCTIONS ---"

# =====================================================================
# 3. Base Workspace Tools
# =====================================================================

def list_dir(dir_path: str = ".") -> str:
    """Lists the contents of a directory.

    Args:
        dir_path: The path of the directory to list (defaults to ".").
    """
    print(f"\n[Tool Execution] list_dir(dir_path='{dir_path}')")
    try:
        if not os.path.exists(dir_path):
            return f"Error: Directory '{dir_path}' does not exist."
        if not os.path.isdir(dir_path):
            return f"Error: Path '{dir_path}' is not a directory."
        items = os.listdir(dir_path)
        output = []
        for item in sorted(items):
            full_path = os.path.join(dir_path, item)
            is_dir = "DIR" if os.path.isdir(full_path) else "FILE"
            size = os.path.getsize(full_path) if is_dir == "FILE" else "-"
            output.append(f"[{is_dir}] {item} ({size} bytes)")
        res = "\n".join(output) if output else "Directory is empty."
        print(f" -> Found {len(items)} items.")
        return res
    except Exception as e:
        return f"Error listing directory: {str(e)}"

def read_file(file_path: str) -> str:
    """Reads the entire content of a local file.

    Args:
        file_path: The path of the file to read.
    """
    print(f"\n[Tool Execution] read_file(file_path='{file_path}')")
    try:
        if not os.path.exists(file_path):
            return f"Error: File '{file_path}' does not exist."
        if os.path.isdir(file_path):
            return f"Error: '{file_path}' is a directory, not a file."
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
            print(f" -> Successfully read {len(content)} characters.")
            return content
    except Exception as e:
        return f"Error reading file: {str(e)}"

def write_file(file_path: str, content: str) -> str:
    """Writes (creates or overwrites) content to a file. Creates any parent directories if they do not exist.

    Args:
        file_path: The path of the file to write to.
        content: The text content to write to the file.
    """
    print(f"\n[Tool Execution] write_file(file_path='{file_path}', content_len={len(content)})")
    try:
        parent_dir = os.path.dirname(file_path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        msg = f"Success: Wrote {len(content)} characters to '{file_path}'."
        print(f" -> {msg}")
        return msg
    except Exception as e:
        return f"Error writing file: {str(e)}"

def grep_search(query: str, search_path: str = ".") -> str:
    """Searches for a specific regular expression query or string within files under the search_path.

    Args:
        query: The regex pattern or string query to search for.
        search_path: The path of the file or directory to search in (defaults to ".").
    """
    import re
    print(f"\n[Tool Execution] grep_search(query='{query}', search_path='{search_path}')")
    try:
        if not os.path.exists(search_path):
            return f"Error: Search path '{search_path}' does not exist."
        
        # Compile regex if possible, fallback to literal match if invalid regex
        try:
            pattern = re.compile(query, re.IGNORECASE)
            is_regex = True
        except re.error:
            is_regex = False

        matches = []
        if os.path.isfile(search_path):
            files_to_search = [search_path]
        else:
            files_to_search = []
            for root, _, filenames in os.walk(search_path):
                if any(ignored in root for item in ["node_modules", ".venv", ".git", "__pycache__"] for ignored in [f"/{item}", f"/{item}/"]):
                    continue
                for filename in filenames:
                    files_to_search.append(os.path.join(root, filename))
                    
        for file_p in files_to_search:
            try:
                with open(file_p, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_num, line_content in enumerate(f, 1):
                        matched = False
                        if is_regex:
                            if pattern.search(line_content):
                                matched = True
                        else:
                            if query in line_content:
                                matched = True
                                
                        if matched:
                            matches.append(f"{file_p}:{line_num}: {line_content.strip()}")
                            if len(matches) >= 50:
                                return "\n".join(matches) + "\n(Output capped at 50 results)"
            except Exception:
                pass
                
        return "\n".join(matches) if matches else "No matches found."
    except Exception as e:
        return f"Error performing grep search: {str(e)}"

def line_replace(file_path: str, first_replaced_line: int, last_replaced_line: int, search: str, replace: str) -> str:
    """Finds and replaces specific content in a file using explicit line numbers.
    This is the preferred and primary tool for editing existing files.

    Args:
        file_path: The path of the file to modify.
        first_replaced_line: First line number to replace (1-indexed).
        last_replaced_line: Last line number to replace (1-indexed).
        search: The content to search for (supports ellipsis '...' on a line of its own for large sections).
        replace: The new content to replace the found content with.
    """
    import re
    print(f"\n[Tool Execution] line_replace(file_path='{file_path}', range=[{first_replaced_line}, {last_replaced_line}])")
    try:
        if not os.path.exists(file_path):
            return f"Error: File '{file_path}' does not exist."
        if os.path.isdir(file_path):
            return f"Error: '{file_path}' is a directory, not a file."
            
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        if first_replaced_line < 1 or last_replaced_line > len(lines) or first_replaced_line > last_replaced_line:
            return f"Error: Invalid line range [{first_replaced_line}, {last_replaced_line}]. File has {len(lines)} lines."
            
        target_lines = lines[first_replaced_line - 1 : last_replaced_line]
        target_content = "".join(target_lines)
        
        search_clean = search.strip()
        target_clean = target_content.strip()
        
        # Check if ellipsis is used
        # Split search on any line containing just "..." (with optional comments or whitespace)
        parts = re.split(r'\n\s*(?://|#)?\s*\.\.\.\s*\n', '\n' + search + '\n')
        parts = [p.strip() for p in parts if p.strip()]
        
        if len(parts) >= 2:
            prefix = parts[0]
            suffix = parts[-1]
            
            # 1. Exact start/end match on target_clean
            if not (target_clean.startswith(prefix) and target_clean.endswith(suffix)):
                # 2. Try looser line-by-line comparison ignoring leading/trailing whitespace
                target_lines_stripped = [l.strip() for l in target_lines if l.strip()]
                prefix_lines_stripped = [l.strip() for l in prefix.split("\n") if l.strip()]
                suffix_lines_stripped = [l.strip() for l in suffix.split("\n") if l.strip()]
                
                prefix_ok = True
                for i, pl in enumerate(prefix_lines_stripped):
                    if i >= len(target_lines_stripped) or pl != target_lines_stripped[i]:
                        prefix_ok = False
                        break
                        
                suffix_ok = True
                for i, sl in enumerate(reversed(suffix_lines_stripped)):
                    idx = len(target_lines_stripped) - 1 - i
                    if idx < 0 or sl != target_lines_stripped[idx]:
                        suffix_ok = False
                        break
                        
                if not (prefix_ok and suffix_ok):
                    return f"Error: Content verification failed.\nTarget range has prefix:\n{target_lines[:3]}\nand suffix:\n{target_lines[-3:]}\n\nBut expected prefix:\n{prefix}\nand suffix:\n{suffix}"
        else:
            # Full match (no ellipsis)
            if search_clean not in target_clean:
                # Try looser match ignoring whitespace
                search_lines = [l.strip() for l in search.split("\n") if l.strip()]
                target_lines_stripped = [l.strip() for l in target_lines if l.strip()]
                if search_lines != target_lines_stripped:
                    return f"Error: Content verification failed. File range does not match search pattern."
                    
        # Apply the replacement
        before = lines[:first_replaced_line - 1]
        after = lines[last_replaced_line:]
        
        new_content = "".join(before) + replace + "\n" + "".join(after)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print(f" -> Successfully replaced lines {first_replaced_line}-{last_replaced_line} in '{file_path}'.")
        return f"Success: Replaced lines {first_replaced_line} to {last_replaced_line} in '{file_path}' successfully."
    except Exception as e:
        return f"Error executing line_replace: {str(e)}"

def add_dependency(package_name: str, dependency_type: str = "auto") -> str:
    """Adds a package dependency to the project. Supports Node.js (npm) and Python (pip).

    Args:
        package_name: The name of the package/dependency to install (e.g. 'lodash@latest' or 'requests').
        dependency_type: 'auto', 'npm', or 'pip'. If 'auto', we auto-detect based on workspace files.
    """
    print(f"\\n[Tool Execution] add_dependency(package_name='{package_name}', dependency_type='{dependency_type}')")
    import re
    if not re.match(r'^[\\w\\-@/.]+$', package_name):
        return "Error: Invalid package name."
        
    try:
        dep_type = dependency_type.lower()
        if dep_type == "auto":
            if os.path.exists("package.json"):
                dep_type = "npm"
            elif os.path.exists("requirements.txt") or os.path.exists(".venv") or os.path.exists("pyproject.toml"):
                dep_type = "pip"
            else:
                dep_type = "npm" # Default fallback
                
        if dep_type == "npm":
            cmd = ["npm", "install", package_name]
            print(f" -> Auto-detected Node.js project. Running: {' '.join(cmd)}")
            res = subprocess.run(cmd, shell=False, text=True, capture_output=True)
            output = f"Exit Code: {res.returncode}\\n\\n[STDOUT]\\n{res.stdout}\\n[STDERR]\\n{res.stderr}"
            return f"Success: Node.js package installed:\\n{output}"
        elif dep_type == "pip":
            pip_path = "pip"
            if os.path.exists(".venv/bin/pip"):
                pip_path = ".venv/bin/pip"
            elif os.path.exists("venv/bin/pip"):
                pip_path = "venv/bin/pip"
            cmd = [pip_path, "install", package_name]
            print(f" -> Auto-detected Python project. Running: {' '.join(cmd)}")
            res = subprocess.run(cmd, shell=False, text=True, capture_output=True)
            output = f"Exit Code: {res.returncode}\\n\\n[STDOUT]\\n{res.stdout}\\n[STDERR]\\n{res.stderr}"
            # Re-freeze dependencies to requirements.txt if it exists
            if os.path.exists("requirements.txt"):
                try:
                    with open("requirements.txt", "w") as req_file:
                        subprocess.run([pip_path, "freeze"], shell=False, text=True, stdout=req_file)
                except Exception:
                    pass
            return f"Success: Python dependency installed:\\n{output}"
        else:
            return f"Error: Unsupported dependency type '{dependency_type}'."
    except Exception as e:
        return f"Error installing dependency: {str(e)}"

def run_command(command: str) -> str:
    """Executes a terminal/bash command on the macOS system and returns the combined stdout and stderr.

    Args:
        command: The shell command to run.
    """
    print(f"\\n[Tool Execution] run_command(command='{command}')")
    denylist = ["rm -rf /", "mkfs", "dd if="]
    if any(bad in command for bad in denylist):
        return "Error: Command rejected by denylist."

    import shlex
    try:
        args = shlex.split(command)
        result = subprocess.run(
            args,
            shell=False,
            text=True,
            capture_output=True,
            timeout=60
        )
        output = []
        if result.stdout:
            output.append("[STDOUT]\n" + result.stdout)
        if result.stderr:
            output.append("[STDERR]\n" + result.stderr)
        
        ret_code = f"Exit Code: {result.returncode}"
        combined = "\n".join(output)
        res = f"{ret_code}\n\n{combined}"
        print(f" -> Command completed with exit code: {result.returncode}")
        return res
    except subprocess.TimeoutExpired:
        return "Error: Command timed out after 60 seconds."
    except Exception as e:
        return f"Error running command: {str(e)}"

def get_memory_file_path() -> str:
    path = os.path.expanduser('~/.config/dt/memory/agent_memory.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path

def save_memory(key: str, value: str) -> str:
    """Stores a user preference, architectural rule, tech stack choice, or project context
    inside a local persistent `.agent_memory.json` file in the current directory.

    Args:
        key: The configuration or context key (e.g., 'ui_preference', 'tech_stack').
        value: The value/text content to store for this key.
    """
    print(f"\\n[Tool Execution] save_memory(key='{key}', value_len={len(value)})")
    memory_file = get_memory_file_path()
    try:
        data = {}
        if os.path.exists(memory_file):
            with open(memory_file, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    pass
        
        data[key] = value
        with open(memory_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        msg = f"Success: Saved memory '{key}' to '{memory_file}'."
        print(f" -> {msg}")
        return msg
    except Exception as e:
        return f"Error saving memory: {str(e)}"

def read_memories() -> str:
    """Reads and returns all stored key-value context memories from `.agent_memory.json`
    in the current directory.
    """
    print("\\n[Tool Execution] read_memories()")
    memory_file = get_memory_file_path()
    if not os.path.exists(memory_file):
        return "No local memories or preferences have been stored yet."
    try:
        with open(memory_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not data:
            return "Local memory store is empty."
        
        output = ["--- LOCAL AGENT MEMORIES & PREFERENCES ---"]
        for k, v in data.items():
            output.append(f"- **{k}**: {v}")
        return "\n".join(output)
    except Exception as e:
        return f"Error reading memories: {str(e)}"

# =====================================================================
# 4. Master Tools Registry
# =====================================================================

class ToolsRegistry:
    def __init__(self):
        self.local_tools = {
            "list_dir": list_dir,
            "read_file": read_file,
            "write_file": write_file,
            "line_replace": line_replace,
            "add_dependency": add_dependency,
            "grep_search": grep_search,
            "run_command": run_command,
            "list_global_skills": list_global_skills,
            "use_global_skill": use_global_skill,
            "load_superpower_skill": load_superpower_skill,
            "save_memory": save_memory,
            "read_memories": read_memories
        }
        self.mcp_clients = {}
        self.mcp_tools_map = {} # Maps dynamic tool names to (client, original_name)
        
    def load_mcp_servers(self, server_names: list = None):
        config_path = os.environ.get("DT_MCP_CONFIG_PATH", os.path.expanduser("~/.gemini/antigravity/mcp_config.json"))
        if not os.path.exists(config_path):
            return
            
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            servers = config.get("mcpServers", {})
            
            target_servers = server_names if server_names else list(servers.keys())
            
            for s_name in target_servers:
                if s_name not in servers:
                    continue
                s_cfg = servers[s_name]
                # Only load STDIO processes (they have a command and arguments)
                if "command" in s_cfg:
                    cmd = s_cfg["command"]
                    args = s_cfg.get("args", [])
                    client = MCPProcessClient(s_name, cmd, args)
                    if client.start():
                        self.mcp_clients[s_name] = client
                        tools = client.fetch_tools()
                        for t in tools:
                            original_name = t["name"]
                            # Namespace to avoid name collisions across MCP servers
                            namespaced_name = f"mcp_{s_name.replace('-', '_')}_{original_name}"
                            self.mcp_tools_map[namespaced_name] = (client, original_name, t)
                            print(f"   ├─ Tool Registered: {namespaced_name}")
        except Exception as e:
            print(f"Error loading MCP servers in registry: {e}")
            
    def get_gemini_tools(self) -> list:
        gemini_tools = []
        
        # 1. Base local tools (We manually define their schemas to be explicit)
        gemini_tools.append(types.FunctionDeclaration(
            name="list_dir",
            description="Lists the contents of a directory.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "dir_path": {"type": "string", "description": "The directory path (defaults to '.')."}
                }
            }
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="read_file",
            description="Reads the entire content of a local file.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "The path of the file to read."}
                },
                "required": ["file_path"]
            }
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="write_file",
            description="Writes (creates or overwrites) content to a file. Mainly used for creating new files.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "The path of the file to write to."},
                    "content": {"type": "string", "description": "The text content to write to the file."}
                },
                "required": ["file_path", "content"]
            }
        ))

        gemini_tools.append(types.FunctionDeclaration(
            name="line_replace",
            description="Finds and replaces specific content in a file using explicit line numbers. This is the PREFERRED and PRIMARY tool for editing existing files. Always use this instead of write_file for edits.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "The path of the file to modify."},
                    "first_replaced_line": {"type": "integer", "description": "The 1-indexed number of the first line to replace."},
                    "last_replaced_line": {"type": "integer", "description": "The 1-indexed number of the last line to replace."},
                    "search": {"type": "string", "description": "The exact content to replace (supports ellipsis '...' on a line of its own for large sections)."},
                    "replace": {"type": "string", "description": "The new content to replace with."}
                },
                "required": ["file_path", "first_replaced_line", "last_replaced_line", "search", "replace"]
            }
        ))

        gemini_tools.append(types.FunctionDeclaration(
            name="add_dependency",
            description="Adds a package dependency to the project. Supports Node.js (npm) and Python (pip).",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "package_name": {"type": "string", "description": "The package name to install (e.g., 'lodash@latest' or 'requests')."},
                    "dependency_type": {"type": "string", "description": "Package type: 'auto', 'npm', or 'pip'.", "enum": ["auto", "npm", "pip"]}
                },
                "required": ["package_name"]
            }
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="grep_search",
            description="Searches for a specific regular expression pattern or string query within files under a path.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The regex pattern or query string to search for."},
                    "search_path": {"type": "string", "description": "The path to search in (defaults to '.')."}
                },
                "required": ["query"]
            }
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="run_command",
            description="Executes a terminal/bash command on the macOS system.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to run."}
                },
                "required": ["command"]
            }
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="list_global_skills",
            description="Lists all available global agent skills on your macOS and their descriptions."
        ))
        
        gemini_tools.append(types.FunctionDeclaration(
            name="use_global_skill",
            description="Loads and executes a global skill's instructions on a specific task/query.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "The name of the global skill."},
                    "task": {"type": "string", "description": "The task or code query to process using that skill's rules."}
                },
                "required": ["skill_name", "task"]
            }
        ))

        gemini_tools.append(types.FunctionDeclaration(
            name="load_superpower_skill",
            description="Loads a global skill's full instructions (SKILL.md) directly into the agent's context.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "The name of the global skill (e.g. 'test-driven-development', 'graphify', 'doubt-driven-development')."}
                },
                "required": ["skill_name"]
            }
        ))

        gemini_tools.append(types.FunctionDeclaration(
            name="save_memory",
            description="Stores a user preference, architectural rule, tech stack choice, or project context inside `.agent_memory.json`.",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "The config or context key (e.g. 'ui_preference', 'tech_stack')."},
                    "value": {"type": "string", "description": "The value/text to store for this key."}
                },
                "required": ["key", "value"]
            }
        ))

        gemini_tools.append(types.FunctionDeclaration(
            name="read_memories",
            description="Reads and returns all stored key-value context memories from `.agent_memory.json`."
        ))
        
        # 2. Dynamic MCP tools
        for namespaced_name, (_, _, t_schema) in self.mcp_tools_map.items():
            # Build function declaration directly from MCP tool schema
            mcp_desc = t_schema.get("description", "Dynamic MCP tool")
            mcp_params = t_schema.get("inputSchema", {"type": "object", "properties": {}})
            
            gemini_tools.append(types.FunctionDeclaration(
                name=namespaced_name,
                description=f"[MCP Tool] {mcp_desc}",
                parameters_json_schema=mcp_params
            ))
            
        return [types.Tool(function_declarations=gemini_tools)]
        
    def execute_tool(self, name: str, arguments: dict) -> str:
        # 1. Check local tools
        if name in self.local_tools:
            try:
                res = self.local_tools[name](**arguments)
                return str(res)
            except Exception as e:
                return f"Error executing local tool '{name}': {e}"
                
        # 2. Check dynamic MCP tools
        if name in self.mcp_tools_map:
            client, original_name, _ = self.mcp_tools_map[name]
            print(f"\n🔌 [Tool Execution] Dispatching to MCP '{client.name}' -> {original_name}")
            mcp_res = client.call_tool(original_name, arguments)
            
            # Extract content from MCP response format
            content_list = mcp_res.get("content", [])
            output_parts = []
            for block in content_list:
                if block.get("type") == "text":
                    output_parts.append(block.get("text", ""))
            return "\n".join(output_parts) if output_parts else str(mcp_res)
            
        return f"Error: Tool '{name}' is not registered."
        
    def cleanup(self):
        for client in self.mcp_clients.values():
            client.stop()
