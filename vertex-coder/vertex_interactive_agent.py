#!/usr/bin/env python3
import sys
import os
import subprocess

try:
    from google import genai
    from google.genai import types
    from google.oauth2.credentials import Credentials
    from tools_registry import ToolsRegistry, get_gcloud_credentials
except ImportError as e:
    print(f"Failed to import libraries: {e}")
    sys.exit(1)
import json

# Default configuration config loading
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

def load_skill_instructions(skill_names: list) -> str:
    if not skill_names:
        return ""
    
    loaded_skills_content = []
    paths = [
        os.environ.get("DT_SKILLS_PATH_1", os.path.expanduser("~/.agents/skills")),
        os.environ.get("DT_SKILLS_PATH_2", os.path.expanduser("~/.gemini/config/skills"))
    ]
    
    for skill_name in skill_names:
        skill_content = ""
        for p in paths:
            skill_md_path = os.path.join(p, skill_name, "SKILL.md")
            if os.path.exists(skill_md_path):
                try:
                    with open(skill_md_path, 'r', encoding='utf-8') as f:
                        skill_content = f.read()
                    break
                except Exception:
                    pass
        if skill_content:
            loaded_skills_content.append(
                f"### SKILL: {skill_name}\n"
                f"Use the following expert guidelines and constraints when working on tasks that involve or require this skill:\n\n"
                f"{skill_content}\n"
                f"----------------------------------------\n"
            )
        else:
            print(f"⚠️ Warning: Pre-loaded skill '{skill_name}' was not found in global skills paths.")
            
    if loaded_skills_content:
        return (
            "\n\n## PRE-LOADED EXPERT METHODOLOGY SKILLS\n"
            "The following expert developer skills and instructions have been pre-loaded for this session. "
            "You MUST integrate these standards, constraints, and methodologies (such as Test-Driven Development, Spec-Driven Development, Doubt-Driven Development, or structural graphify project analysis) "
            "fully into your current workspace actions. Apply them rigorously, and run appropriate testing/checks locally using your available tools.\n\n"
            + "\n".join(loaded_skills_content)
        )
    return ""

def run_interactive_agent(prompt: str, model_name: str = "gemini-3.1-pro-custom-tools", skills: list = None):
    # Determine the target project and location. Fall back to the active gcloud
    # project when no env/config value is set so standalone `dt vx interactive`
    # runs don't crash building HttpOptions with a None x-goog-user-project header.
    target_project = os.environ.get("VERTEX_CODER_PROJECT") or project_id
    if not target_project:
        try:
            import subprocess
            proj = subprocess.run(
                ["gcloud", "config", "get-value", "project"],
                capture_output=True, text=True,
            ).stdout.strip()
            if proj and proj != "(unset)":
                target_project = proj
        except Exception:
            target_project = None
    target_location = os.environ.get("VERTEX_CODER_LOCATION", location)
    
    # Map friendly model names to model registry names
    resolved_model = model_name
    if model_name == "gemini-3.1-pro":
        resolved_model = "gemini-3.1-pro-preview"
        target_location = "global"
    elif model_name in ["gemini-3.1-pro-custom-tools", "gemini-3.1-pro-preview-customtools"]:
        resolved_model = "gemini-3.1-pro-preview-customtools"
        target_location = "global"
    elif model_name == "gemini-3.5-flash":
        resolved_model = "gemini-3.5-flash"
        target_location = "global"
        
    print(f"==============================================================")
    print(f"🚀 Launching Autonomous Vertex AI Coding Agent (Interactive)")
    print(f"🎯 Model: {resolved_model} (requested: {model_name})")
    print(f"💼 Project ID: {target_project}")
    print(f"📍 Location: {target_location}")
    print(f"==============================================================")
    
    creds = get_gcloud_credentials()
    if not creds:
        print("Error: Could not retrieve gcloud authentication credentials.")
        return
        
    # Initialize unified Master Tools Registry
    print("\n🛠️  Initializing Master Tools Registry...")
    registry = ToolsRegistry()
    
    # Configure MCP servers to load from environment variable
    # VERTEX_LOAD_MCPS="sequential-thinking,codex-harness-bridge" (default) or "all" or "none"
    mcp_env = os.environ.get("VERTEX_LOAD_MCPS", "sequential-thinking,codex-harness-bridge")
    if mcp_env.lower() != "none":
        server_list = None if mcp_env.lower() == "all" else [s.strip() for s in mcp_env.split(",") if s.strip()]
        print(f"🔌 Loading MCP Servers (Setting: '{mcp_env}')...")
        registry.load_mcp_servers(server_list)
        
    # Set up Client
    client = genai.Client(
        vertexai=True,
        project=target_project,
        location=target_location,
        credentials=creds,
        http_options=types.HttpOptions(
            headers={"x-goog-user-project": target_project} if target_project else {}
        )
    )
    
    system_instruction = (
        "You are Vertex Coder, an elite, fully autonomous AI software engineering agent that creates, modifies, and debugs code on the user's macOS system. "
        "You are designed to be extremely fast, cost-effective, precise, and proactive.\n\n"
        
        "## CORE DIRECTIVES (THE SECRET SAUCE)\n\n"
        
        "1. STRICT RESPONSE CONCISENESS:\n"
        "   - Conversational responses MUST be strictly under 4 lines of text. No chatty preambles, polite fillers, or conversational postambles.\n"
        "   - Do not write long explanations of what you are about to do or what you did. Be direct and objective. Save your words for tool execution.\n\n"
        
        "2. PROACTIVE QUALITY GATE & VERIFICATION:\n"
        "   - You are explicitly authorized and expected to proactively verify your changes using local builders, test suites, or linters (e.g. running pytest, npm run build, eslint via run_command) immediately after modifying code.\n"
        "   - Do not ask the user for permission to verify your work. Verify first, catch and fix errors, and report only the finalized, working state.\n\n"
        
        "3. DEPENDENCY-FIRST PIPELINE:\n"
        "   - You must install new third-party packages or system dependencies using add_dependency BEFORE creating or modifying files that import them. This prevents compilation/type-checking errors.\n\n"
        
        "4. DEEP CODEBASE & INTERNAL INSPECTION:\n"
        "   - If library documentation is missing, ambiguous, or types are failing, read package definitions directly from node_modules/<package>/package.json, or inspect internal python/system files. Do not guess.\n\n"
        
        "5. PERSISTENT LOCAL MEMORY STORE:\n"
        "   - You have tools to read and write to .agent_memory.json. Use save_memory to proactively store user preferences, tech stack choices, custom architecture rules, and milestone decisions.\n"
        "   - This memory is automatically loaded at startup, so any rule or detail saved here will be permanently retained across future agent sessions.\n\n"
        
        "6. ELITE REFERENCE STYLE:\n"
        "   - Refer to files and code locations strictly using the format path/file.ext:line_number (e.g. src/app.py:145). This allows immediate navigation.\n\n"
        
        "7. SYSTEMATIC REASONING GATES:\n"
        "   - Summarize your plan and thoughts prior to committing wide-scale or complex changes, git checkouts, or major file edits.\n\n"
        
        "## TECHNOLOGY STACK & CAPABILITIES\n"
        "Vertex Coder supports any technology stack (Python, Node.js, React, Next.js, Vite, Tailwind CSS, SQL databases, Docker, Firebase, Cloud Run, etc.). "
        "You have full command-line access, allowing you to run backend code, execute terminal commands, manage local databases, write APIs, and deploy services directly.\n\n"
        
        "## TOOL TYPES\n"
        "1. LOCAL TOOLS:\n"
        "   - list_dir: list files and directories\n"
        "   - read_file: read the entire content of a file\n"
        "   - write_file: create or overwrite a file (mainly for creating new files)\n"
        "   - line_replace: finds and replaces specific content in a file using explicit 1-indexed line numbers. PREFERRED and PRIMARY tool for editing existing files. Always prefer this over write_file.\n"
        "   - add_dependency: adds a package dependency safely (npm package or pip package).\n"
        "   - grep_search: searches for a specific regular expression pattern or string query within workspace files.\n"
        "   - run_command: execute any bash/terminal command locally (timeout: 60s)\n"
        "   - save_memory: save key-value context to .agent_memory.json\n"
        "   - read_memories: read all key-value context from .agent_memory.json\n"
        "2. GLOBAL SKILLS INTEGRATION:\n"
        "   - list_global_skills: list all specialized agent instructions on your macOS.\n"
        "   - use_global_skill(skill_name, task): dynamically read a skill's guidelines and run a sub-agent to execute that task using those specific guidelines/rules.\n"
        "   - load_superpower_skill(skill_name): dynamically read and load a global skill's full instructions (SKILL.md) directly into your current context, allowing you to follow its methodologies (e.g. test-driven-development, doubt-driven-development, graphify) natively.\n"
        "3. DYNAMIC MCP TOOLS: Tools from connected MCP servers prefixed with 'mcp_<server_name>_'. Use them to interface with DevTools, Firebase, Supabase, etc.\n\n"
        
        "## IMPORTANT: MINIMIZE CODE WRITING\n"
        "- PREFER using line_replace for most changes instead of rewriting entire files.\n"
        "- write_file is mainly meant for creating new files or as fallback if line_replace fails.\n"
        "- When writing/replacing is necessary, MAXIMIZE use of \"keep existing code\" placeholders/comments to maintain unmodified sections.\n"
        "- Any unchanged code block over 5 lines MUST use \"// ... keep existing code\" comment or equivalent comment of the language (e.g. # ... keep existing code in Python).\n"
        "- NEVER rewrite large sections of code that don't need to change.\n\n"
        
        "### Using line_replace (Line-Based Search and Replace):\n"
        "- Specify first_replaced_line and last_replaced_line as 1-indexed numbers.\n"
        "- When replacing sections of code longer than ~6 lines, use ellipsis (...) in your search to reduce lines specified.\n"
        "- Include the first 2-3 lines, add \"...\" on its own line, and include the last 2-3 lines of the section to replace.\n"
        "- Make sure prefix and suffix contain exact matches from the file.\n\n"
        
        "### SEO Requirements:\n"
        "ALWAYS implement SEO best practices automatically for every frontend page/component.\n"
        "- Title tags: Include main keyword, keep under 60 characters\n"
        "- Meta description: Max 160 characters with target keyword naturally integrated\n"
        "- Single H1: Must match page's primary intent and include main keyword\n"
        "- Semantic HTML: Use <header>, <nav>, <main>, <article>, <section>, <footer>\n"
        "- Image optimization: All images must have descriptive alt attributes with relevant keywords\n"
        "- Structured data: Add JSON-LD for products, articles, FAQs when applicable\n"
        "- Performance: Implement lazy loading for images, defer non-critical scripts\n"
        "- Canonical tags: Add to prevent duplicate content issues\n"
        "- Mobile optimization: Ensure responsive design with proper viewport meta tag\n"
        "- Clean URLs: Use descriptive, crawlable internal links\n\n"
        
        "Current date: 2026-06-19\n"
        "Always reply in the same language as the user's message."
    )
    
    # Get tools from registry
    gemini_tools = registry.get_gemini_tools()
    
    # Load and print any persistent memories
    print("🧠 Querying persistent local memory store...")
    stored_memories = ""
    try:
        from tools_registry import read_memories
        mem_res = read_memories()
        if "--- LOCAL AGENT MEMORIES & PREFERENCES ---" in mem_res:
            print(" -> Loaded existing saved project memories.")
            stored_memories = mem_res
        else:
            print(" -> No existing persistent project memories found.")
    except Exception as e:
        print(f" -> Error reading local memory: {e}")
        
    combined_system_instruction = system_instruction
    if skills:
        skills_text = load_skill_instructions(skills)
        if skills_text:
            combined_system_instruction += skills_text
            
    if stored_memories:
        combined_system_instruction += "\n\n## ACTIVE PROJECT PREFERENCES & MEMORIES\n" + stored_memories
        
    config = types.GenerateContentConfig(
        system_instruction=combined_system_instruction,
        tools=gemini_tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.1,  # Keep it precise and structured for coding
    )
    
    print("\nInitializing multi-turn chat session with custom tools registry...")
    chat = client.chats.create(
        model=resolved_model,
        config=config
    )
    
    print("\n🤖 Agent received instruction:")
    print(f"👉 \"{prompt}\"")
    print("\n--------------------------------------------------------------")
    print("🤖 Agent is reasoning and executing tools...")
    
    try:
        response = chat.send_message(prompt)
        
        # Start manual Tool execution loop
        max_turns = 30
        turn = 0
        while turn < max_turns:
            if not response.function_calls:
                break
                
            turn += 1
            print(f"\n--- [Turn {turn}] Agent requested {len(response.function_calls)} tool call(s) ---")
            
            tool_responses = []
            for call in response.function_calls:
                name = call.name
                arguments = call.args
                call_id = call.id
                
                args_preview = str(arguments)
                if len(args_preview) > 150:
                    args_preview = args_preview[:150] + "... (truncated)"
                    
                print(f"🤖 Calling tool '{name}' with arguments:")
                print(f"   └─ {args_preview}")
                
                # Execute tool via our master registry
                result = registry.execute_tool(name, arguments)
                
                res_preview = str(result)
                if len(res_preview) > 200:
                    res_preview = res_preview[:200] + "... (truncated)"
                print(f"   └─ Outcome: {res_preview}")
                
                # Create response Part using explicit FunctionResponse to support call ID
                tool_responses.append(types.Part(
                    functionResponse=types.FunctionResponse(
                        name=name,
                        id=call_id,
                        response={"result": result}
                    )
                ))
                
            # Send tool responses back
            print("🤖 Submitting outcomes to Gemini...")
            response = chat.send_message(tool_responses)
            
        print("\n--------------------------------------------------------------")
        print("🎉 Task execution complete!")
        print("\n🤖 Final Response from Agent:")
        print(response.text)
        
    except Exception as e:
        print(f"\n❌ Error during execution: {e}")
    finally:
        # Stop all running MCP servers to clean up resources
        registry.cleanup()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Vertex Coder Interactive Agent")
    parser.add_argument("prompt", nargs="?", default=None, help="The prompt or task for the agent.")
    parser.add_argument("model", nargs="?", default="gemini-3.1-pro-custom-tools", help="Model name.")
    parser.add_argument("-s", "--skills", nargs="+", default=[], help="Specialized skills to pre-load.")
    
    args = parser.parse_args()

    # "-" is the stdin sentinel used by the relay (it pipes the brief on stdin to
    # keep large briefs out of argv). Read the actual prompt from stdin in that case.
    if args.prompt == "-":
        args.prompt = sys.stdin.read().strip()

    if not args.prompt:
        parser.print_help()
        sys.exit(1)

    run_interactive_agent(args.prompt, args.model, args.skills)
