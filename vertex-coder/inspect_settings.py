import os
import json
import sys
import subprocess
from google.cloud import dialogflowcx_v3 as dialogflow

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
project_id = config_data.get("project_id", "fair-geography-494614-q0")
location = config_data.get("location", "us-central1")
agent_id = config_data.get("agent_id", "59041f2f-e981-4155-b7c6-ed11d12756b2")

def get_gcloud_credentials():
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

if __name__ == "__main__":
    import google.oauth2.credentials
    credentials = get_gcloud_credentials()
    if not credentials:
        sys.exit(1)
        
    client = dialogflow.AgentsClient(
        credentials=credentials,
        client_options={
            "api_endpoint": f"{location}-dialogflow.googleapis.com",
            "quota_project_id": project_id
        }
    )
    
    agent_path = f"projects/{project_id}/locations/{location}/agents/{agent_id}"
    print(f"Fetching generative settings for: {agent_path}")
    
    try:
        settings = client.get_generative_settings(
            name=f"{agent_path}/generativeSettings",
            language_code="en"
        )
        print("\n--- Generative Settings ---")
        print(settings)
    except Exception as e:
        print(f"Failed to fetch generative settings: {e}")
