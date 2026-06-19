import os
import json
import sys
import subprocess
from google.cloud import dialogflowcx_v3 as dialogflow
from google.protobuf import field_mask_pb2
from google.oauth2.credentials import Credentials

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
        credentials = Credentials(token)
        return credentials
    except Exception as e:
        print(f"Failed to fetch credentials from gcloud: {e}")
        return None

def update_model():
    credentials = get_gcloud_credentials()
    if not credentials:
        print("Error getting credentials.")
        sys.exit(1)
        
    client = dialogflow.AgentsClient(
        credentials=credentials,
        client_options={
            "api_endpoint": f"{location}-dialogflow.googleapis.com",
            "quota_project_id": project_id
        }
    )
    
    agent_path = f"projects/{project_id}/locations/{location}/agents/{agent_id}"
    print(f"Updating model settings for agent: {agent_path}")
    
    # Define the updated generative settings
    generative_settings = dialogflow.GenerativeSettings()
    generative_settings.name = f"{agent_path}/generativeSettings"
    generative_settings.language_code = "en"
    generative_settings.llm_model_settings.model = "gemini-1.5-pro"
    
    # Specify the update mask (only updating the model setting)
    update_mask = field_mask_pb2.FieldMask(paths=["llm_model_settings.model"])
    
    try:
        response = client.update_generative_settings(
            generative_settings=generative_settings,
            update_mask=update_mask
        )
        print("\nSUCCESS! Generative settings updated.")
        print(f"Active model: {response.llm_model_settings.model}")
    except Exception as e:
        print(f"Failed to update generative settings: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_model()
