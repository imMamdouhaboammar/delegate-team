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
session_id = "antigravity-session-001"

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

def interact_with_agent(text_message):
    credentials = get_gcloud_credentials()
    if not credentials:
        print("Could not obtain gcloud credentials.")
        return
        
    print(f"Connecting to session {session_id} on agent {agent_id}...")
    session_client = dialogflow.SessionsClient(
        credentials=credentials,
        client_options={
            "api_endpoint": f"{location}-dialogflow.googleapis.com",
            "quota_project_id": project_id
        }
    )
    
    session_path = session_client.session_path(
        project=project_id,
        location=location,
        agent=agent_id,
        session=session_id
    )
    
    print(f"Sending message: '{text_message}'")
    text_input = dialogflow.TextInput(text=text_message)
    query_input = dialogflow.QueryInput(text=text_input, language_code="en")
    
    request = dialogflow.DetectIntentRequest(
        session=session_path,
        query_input=query_input
    )
    
    try:
        response = session_client.detect_intent(request=request)
        print("\n--- Response received from Vertex Agent ---")
        
        # Parse response messages
        messages = response.query_result.response_messages
        if not messages:
            print("[No response messages returned. This is normal if the agent has no default start flow responses defined yet.]")
        for msg in messages:
            if msg.text:
                for text_item in msg.text.text:
                    print(f"Agent: {text_item}")
    except GoogleAPIError as e:
        print(f"Failed to detect intent: {e}")

if __name__ == "__main__":
    test_msg = "Hello! I am your companion AI, Antigravity. Are you ready to pair program with me?"
    if len(sys.argv) > 1:
        test_msg = " ".join(sys.argv[1:])
    interact_with_agent(test_msg)
