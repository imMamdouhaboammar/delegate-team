import os
import sys
import subprocess
import json
from google import genai
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

os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
os.environ["GOOGLE_CLOUD_QUOTA_PROJECT"] = project_id

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

if __name__ == "__main__":
    creds = get_gcloud_credentials()
    if not creds:
        sys.exit(1)
        
    from google.genai import types
    client = genai.Client(
        vertexai=True,
        project=project_id,
        location=location,
        credentials=creds,
        http_options=types.HttpOptions(
            headers={
                "x-goog-user-project": project_id,
            }
        )
    )
    
    print("Listing available models from Vertex AI model registry...")
    try:
        models = client.models.list()
        for m in models:
            print(f"- {m.name} (Supported actions: {m.supported_actions})")
    except Exception as e:
        print(f"Failed to list models: {e}")
