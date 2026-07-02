import sys
import os
import subprocess

try:
    from google.cloud import dialogflowcx_v3 as dialogflow
    from google.api_core.exceptions import GoogleAPIError
    import google.oauth2.credentials
except ImportError as e:
    print(f"Failed to import Google Cloud libraries: {e}")
    sys.exit(1)
import json

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
project_id = config_data.get("project_id", "fair-geography-494614-q0")
location = config_data.get("location", "us-central1")  # "global" or other region

def get_gcloud_credentials():
    print("Fetching active gcloud access token...")
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"], 
            text=True
        ).strip()
        credentials = google.oauth2.credentials.Credentials(token)
        return credentials
    except Exception as e:
        print(f"Failed to fetch credentials from gcloud: {e}")
        return None

def list_or_create_agent():
    credentials = get_gcloud_credentials()
    if not credentials:
        print("Could not obtain gcloud credentials. Exiting.")
        sys.exit(1)
        
    global location
    print(f"Initializing AgentsClient for location: {location}...")
    client = dialogflow.AgentsClient(
        credentials=credentials,
        client_options={
            "api_endpoint": f"{location}-dialogflow.googleapis.com",
            "quota_project_id": project_id
        }
    )
    
    parent = f"projects/{project_id}/locations/{location}"
    print(f"Parent path: {parent}")
    
    # 1. List existing agents
    print("Checking for existing agents...")
    existing_agents = []
    try:
        request = dialogflow.ListAgentsRequest(parent=parent)
        page_result = client.list_agents(request=request)
        for response in page_result:
            existing_agents.append(response)
            print(f"Found Agent: {response.display_name} ({response.name})")
    except GoogleAPIError as e:
        print(f"Error listing agents in {location}: {e}")
        # If us-central1 fails, let's try global
        if location == "us-central1":
            print("Switching to global location...")
            global_location = "global"
            client_global = dialogflow.AgentsClient(
                credentials=credentials,
                client_options={
                    "api_endpoint": "global-dialogflow.googleapis.com",
                    "quota_project_id": project_id
                }
            )
            parent_global = f"projects/{project_id}/locations/{global_location}"
            try:
                request_global = dialogflow.ListAgentsRequest(parent=parent_global)
                page_result_global = client_global.list_agents(request=request_global)
                for response in page_result_global:
                    existing_agents.append(response)
                    print(f"Found Agent: {response.display_name} ({response.name})")
                # update location, client, parent
                location = global_location
                client = client_global
                parent = parent_global
            except GoogleAPIError as e2:
                print(f"Error listing agents in global: {e2}")
                sys.exit(1)
        else:
            sys.exit(1)
    
    # 2. Check if "Antigravity Coding Agent" exists
    target_agent_name = "Antigravity Coding Agent"
    target_agent = None
    for agent_obj in existing_agents:
        if agent_obj.display_name == target_agent_name:
            target_agent = agent_obj
            print(f"Target agent '{target_agent_name}' already exists.")
            break
            
    if not target_agent:
        print(f"Creating a new agent: '{target_agent_name}'...")
        new_agent = dialogflow.Agent(
            display_name=target_agent_name,
            default_language_code="en",
            time_zone="UTC",
        )
        try:
            response = client.create_agent(parent=parent, agent=new_agent)
            print(f"Successfully created agent: {response.display_name}")
            print(f"Agent resource name: {response.name}")
            target_agent = response
        except GoogleAPIError as e:
            print(f"Failed to create agent in {location}: {e}")
            sys.exit(1)
            
    print("\n--- Summary ---")
    print(f"Agent Name: {target_agent.display_name}")
    print(f"Resource Path: {target_agent.name}")

if __name__ == "__main__":
    list_or_create_agent()
