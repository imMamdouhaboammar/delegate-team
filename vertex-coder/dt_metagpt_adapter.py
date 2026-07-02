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
    "coder": "codex",
    "ui-implementer": "minimax",
    "reviewer": "opencode"
}

# Per-role instructions so the pipeline actually decomposes the work instead of
# every role re-doing the whole task. The architect plans (no code), the coder
# writes the real deliverable, the ui-implementer handles frontend (or no-ops),
# the reviewer verifies/fixes.
ROLE_GUIDANCE = {
    "architect": "Produce a concise implementation plan: list exactly which files to create or modify and the key design decisions. DO NOT write the implementation code yourself — planning only. Write your plan to a file named plan.md in the project root (this is your single required output).",
    "coder": "Implement the architect's plan now (read plan.md). Create/modify the actual code files. This is the PRIMARY writing role — produce the real, working deliverable.",
    "ui-implementer": "Implement any UI/frontend portions of the task. If the task has no UI/frontend component, make NO changes and simply state that no UI work is needed.",
    "reviewer": "Review the implemented files against the task for correctness and completeness. Fix any real issues in place. Record your verdict by appending a short review note to plan.md (this guarantees your review is saved even when no code changes are needed).",
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
    
    dt_cli = os.environ.get("DT_CLI_PATH", "dt")
    
    import re as _re

    _BOOKKEEPING = {".metagpt_dt_config.json", ".dt_aggregation_contract.json", "result.json", "plan.md"}

    def git_changed(root):
        """Cumulative deliverable = files changed vs the committed baseline,
        excluding the adapter's own bookkeeping files. Robust across roles: it
        captures in-place edits and prior-role output that per-role relay diffs
        miss (relay diffs reset their baseline each invocation)."""
        try:
            out = subprocess.run(
                ["git", "status", "--porcelain", "-uall"],
                cwd=root, capture_output=True, text=True,
            ).stdout
        except Exception:
            return []
        files = []
        for line in out.splitlines():
            path = line[3:].strip()
            if path and path not in _BOOKKEEPING:
                files.append(path)
        return files

    executed_roles = []
    all_files_touched = set()
    handoff_context = ""

    for role, backend in routing.items():
        print(f"\n[DT MetaGPT Adapter] === Executing Role: {role} via Backend: {backend} ===")
        guidance = ROLE_GUIDANCE.get(role, "")
        role_prompt = (
            f"You are the {role.upper()} in a multi-role engineering pipeline.\n"
            f"{guidance}\n\nOVERALL TASK:\n{prompt}"
        )
        if handoff_context:
            role_prompt += f"\n\nContext handed off from previous roles:\n{handoff_context}"

        cmd = [dt_cli, "run", role_prompt, "--backend", backend]
        env = os.environ.copy()
        env["DT_CAN_CALL_METAGPT"] = "false"  # Prevent recursive MetaGPT calls
        env["METAGPT_CONFIG"] = config_path

        print(f"[DT MetaGPT Adapter] Dispatching {role} → {backend} (with failover ring)…")
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        sys.stdout.write(result.stdout or "")
        sys.stderr.write(result.stderr or "")

        # Best-effort handoff: load the relay's result.json (its path is printed as
        # "result: <path>") and read the CORRECT key (finalMessage) for the report.
        role_summary = ""
        combined = (result.stdout or "") + (result.stderr or "")
        m = _re.search(r"result:\s*(\S+result\.json)", combined)
        if m and os.path.exists(m.group(1)):
            try:
                with open(m.group(1), "r", encoding="utf-8") as f:
                    rd = json.load(f)
                role_summary = rd.get("finalMessage") or ""
            except Exception:
                pass

        # Cumulative deliverable so far (computed by the adapter, not per-role relay).
        all_files_touched = set(git_changed(workspace_root))

        executed_roles.append({
            "role": role,
            "backend": backend,
            "returncode": result.returncode,
            "cumulative_files": len(all_files_touched),
        })
        handoff_context += (
            f"\n--- {role.upper()} (backend={backend}, exit={result.returncode}) ---\n"
            f"Deliverable files so far: {sorted(all_files_touched)}\n"
            f"Report: {role_summary[:1500]}\n"
        )

        # Do NOT halt on a single role's nonzero exit. Non-writing roles
        # (architect/reviewer) legitimately produce no new files, and dt run has
        # already walked the full failover ring for this role. The pipeline only
        # fails if NOTHING was produced by the end.
        if result.returncode != 0:
            print(f"[DT MetaGPT Adapter] Role {role} exited {result.returncode} "
                  f"(continuing; {len(all_files_touched)} deliverable file(s) so far).")

    produced = sorted(all_files_touched)
    all_success = len(produced) > 0

    contract_path = os.path.join(workspace_root, ".dt_aggregation_contract.json")
    contract = {
        "status": "success" if all_success else "failed",
        "roles_executed": executed_roles,
        "files_touched": produced,
    }
    with open(contract_path, "w") as f:
        json.dump(contract, f, indent=2)

    print(f"\n[DT MetaGPT Adapter] Pipeline {'SUCCESS' if all_success else 'FAILED'} — "
          f"{len(produced)} deliverable file(s): {produced}")
    print(f"[DT MetaGPT Adapter] Generated aggregation contract: {contract_path}")
    sys.exit(0 if all_success else 1)

if __name__ == "__main__":
    main()
