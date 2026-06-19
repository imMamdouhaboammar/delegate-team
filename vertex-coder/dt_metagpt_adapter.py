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

def get_proxy_token():
    token = "dt-proxy-token"
    config_path = os.path.expanduser("~/.config/dt/config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "proxy_token" in data:
                    token = data["proxy_token"]
        except Exception:
            pass
    return os.environ.get("PROXY_TOKEN", token)

def generate_metagpt_config(workspace_root):
    # Generates a dynamic MetaGPT config that routes its internal LLM calls
    # through the dt proxy (localhost:3000)
    token = get_proxy_token()
    config = {
        "llm": {
            "api_type": "openai",
            "api_key": token,
            "base_url": "http://127.0.0.1:3000/v1",
            "model": "google/gemini-3.5-pro" # Default
        },
        "llms": {}
    }
    
    routing = load_role_routing()
    for role, backend in routing.items():
        config["llms"][role] = {
            "api_type": "openai",
            "api_key": token,
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
    print("[DT MetaGPT Adapter] Bootstrapping team orchestrator with per-role execution...")
    
    executed_roles = []
    all_success = True
    
    for role, backend in routing.items():
        print(f"\n[DT MetaGPT Adapter] === Executing Role: {role} via Backend: {backend} ===")
        role_prompt = f"Role: {role}. Task: {prompt}"
        cmd = ["dt", "run", role_prompt, "--backend", backend]
        
        # Pass guardrails
        if os.environ.get("DT_PLAN_ONLY") == "true":
            # For non-metagpt backends we might not have a --plan-only flag natively, but we can pass env
            pass
            
        env = os.environ.copy()
        env["DT_CAN_CALL_METAGPT"] = "false" # Prevent recursive MetaGPT calls
        env["METAGPT_CONFIG"] = config_path # Use the generated config
        
        print(f"[DT MetaGPT Adapter] Executing: {' '.join(cmd)}")
        result = subprocess.run(cmd, env=env)
        
        executed_roles.append({
            "role": role,
            "backend": backend,
            "status": "success" if result.returncode == 0 else "failed"
        })
        
        if result.returncode != 0:
            all_success = False
            print(f"[DT MetaGPT Adapter] Role {role} failed. Halting pipeline.")
            break
        
    # Create an aggregation contract
    contract_path = os.path.join(workspace_root, ".dt_aggregation_contract.json")
    contract = {
        "status": "success" if all_success else "failed",
        "roles_executed": executed_roles,
        "files_touched": ["unknown - see workspace"]
    }
    with open(contract_path, "w") as f:
        json.dump(contract, f, indent=2)
        
    print(f"[DT MetaGPT Adapter] Generated aggregation contract: {contract_path}")
    sys.exit(0 if all_success else 1)

if __name__ == "__main__":
    main()
