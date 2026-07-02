import sys
import os
import re
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
session_id = "antigravity-coding-session"

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

def run_vertex_coding_bridge(target_file_path, prompt):
    # 1. Read local file content
    if not os.path.exists(target_file_path):
        print(f"Local file '{target_file_path}' not found. We will treat this as a NEW file creation.")
        original_code = ""
    else:
        with open(target_file_path, 'r', encoding='utf-8') as f:
            original_code = f.read()
        print(f"Loaded local file '{target_file_path}' ({len(original_code)} characters).")

    # 2. Package prompt for the Vertex Agent
    full_prompt = (
        f"You are a master coding assistant. Your task is to modify/write code based on the user's request.\n"
        f"Here is the local file we are editing: {os.path.basename(target_file_path)}\n"
        f"Original Code:\n"
        f"```\n{original_code}\n```\n\n"
        f"User Instruction: {prompt}\n\n"
        f"IMPORTANT: Please respond with the complete updated code. "
        f"Put the complete code inside a standard markdown code block starting with ``` and the language name. "
        f"Do not write conversational filler; only provide the code block so our automation can parse it."
    )

    # 3. Get Credentials & Initialize Session
    credentials = get_gcloud_credentials()
    if not credentials:
        print("Error: Could not retrieve active gcloud credentials.")
        return

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

    print(f"Sending context and instruction to Vertex Agent...")
    text_input = dialogflow.TextInput(text=full_prompt)
    query_input = dialogflow.QueryInput(text=text_input, language_code="en")
    request = dialogflow.DetectIntentRequest(session=session_path, query_input=query_input)

    try:
        response = session_client.detect_intent(request=request)
        messages = response.query_result.response_messages
        
        agent_reply = ""
        for msg in messages:
            if msg.text:
                for text_item in msg.text.text:
                    agent_reply += text_item + "\n"
        
        # 4. Extract generated code from markdown block
        # Look for code block: ```language ... ```
        code_block_match = re.search(r"```[a-zA-Z]*\n(.*?)```", agent_reply, re.DOTALL)
        
        if code_block_match:
            generated_code = code_block_match.group(1).strip()
            print("\nSuccessfully received and parsed code from Vertex Agent!")
            
            # 5. Write code locally
            with open(target_file_path, 'w', encoding='utf-8') as f:
                f.write(generated_code)
            print(f"SUCCESS: Written {len(generated_code)} characters back to local file '{target_file_path}'!")
        else:
            print("\nCould not find a structured markdown code block in the agent's response.")
            print("Full agent response was:")
            print(agent_reply)
            
    except GoogleAPIError as e:
        print(f"Failed to communicate with Vertex Agent: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 vertex_coder_bridge.py <target_file_path> <your prompt/instructions>")
        sys.exit(1)
        
    file_path = sys.argv[1]
    user_prompt = " ".join(sys.argv[2:])
    run_vertex_coding_bridge(file_path, user_prompt)
