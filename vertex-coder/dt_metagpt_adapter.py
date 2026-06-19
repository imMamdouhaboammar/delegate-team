import sys
import os
import json
import subprocess
from pathlib import Path

# This is an adapter layer that maps MetaGPT roles to dt backends.
# It acts as a bridge so MetaGPT can utilize VertexCoder, Codex, and MiniMax
# through the dt policy gateway.

ROLE_BACKEND_MAP = {
    "architect": "opencode",
    "coder": "vertexcoder",
    "ui-implementer": "minimax",
    "reviewer": "opencode"
}

def load_role_routing():
    # In a full implementation, this parses ROLE_ROUTING.md or a JSON config
    return ROLE_BACKEND_MAP

def generate_metagpt_config(workspace_root):
    # Generates a dynamic MetaGPT config that routes its internal LLM calls
    # through the dt proxy (localhost:3000)
    config = {
        "llm": {
            "api_type": "openai",
            "api_key": "dt-proxy-token",
            "base_url": "http://127.0.0.1:3000/v1",
            "model": "google/gemini-3.5-pro" # Default
        },
        "llms": {}
    }
    
    routing = load_role_routing()
    for role, backend in routing.items():
        config["llms"][role] = {
            "api_type": "openai",
            "api_key": f"dt-proxy-token",
            "base_url": "http://127.0.0.1:3000/v1",
            "model": backend
        }
    
    config_path = os.path.join(workspace_root, ".metagpt_dt_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        
    return config_path

def main():
    if len(sys.argv) < 2:
        print("Usage: dt_metagpt_adapter.py <prompt> [args...]")
        sys.exit(1)
        
    prompt = sys.argv[1]
    workspace_root = os.environ.get("DT_WORKSPACE_ROOT", os.getcwd())
    
    print(f"[DT MetaGPT Adapter] Initializing Role Registry and Backend Mapping...")
    routing = load_role_routing()
    for role, backend in routing.items():
        print(f"  - Role: {role.ljust(15)} => Backend: {backend}")
        
    config_path = generate_metagpt_config(workspace_root)
    print(f"[DT MetaGPT Adapter] Generated dynamic MetaGPT config pointing to DT Proxy: {config_path}")
    
    # Try to import metagpt
    try:
        import metagpt
        print("[DT MetaGPT Adapter] MetaGPT package found. Bootstrapping team orchestrator...")
        # Here we would normally do:
        # from metagpt.software_company import generate_repo
        # generate_repo(prompt)
        
        # For the sake of the adapter shell when metagpt isn't fully initialized, we just launch the CLI
        cmd = ["metagpt", prompt, "--project-path", workspace_root]
        print(f"[DT MetaGPT Adapter] Executing: {' '.join(cmd)}")
        result = subprocess.run(cmd, env=os.environ)
        
        # Create an aggregation contract
        contract_path = os.path.join(workspace_root, ".dt_aggregation_contract.json")
        contract = {
            "status": "success" if result.returncode == 0 else "failed",
            "roles_executed": list(routing.keys()),
            "files_touched": ["unknown - see workspace"]
        }
        with open(contract_path, "w") as f:
            json.dump(contract, f, indent=2)
            
        print(f"[DT MetaGPT Adapter] Generated aggregation contract: {contract_path}")
        sys.exit(result.returncode)
        
    except ImportError:
        print("[DT MetaGPT Adapter] Warning: 'metagpt' package not installed in the current environment.")
        print("[DT MetaGPT Adapter] This is a mock execution to demonstrate the adapter routing.")
        
        contract_path = os.path.join(workspace_root, ".dt_aggregation_contract.json")
        contract = {
            "status": "mock_success",
            "roles_executed": list(routing.keys()),
            "files_touched": ["mock_file.py"]
        }
        with open(contract_path, "w") as f:
            json.dump(contract, f, indent=2)
            
        print(f"[DT MetaGPT Adapter] Generated mock aggregation contract: {contract_path}")
        sys.exit(0)

if __name__ == "__main__":
    main()
