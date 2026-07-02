import sys
import os
import re
import subprocess

try:
    from google import genai
    from google.genai import types
    from google.oauth2.credentials import Credentials
except ImportError as e:
    print(f"Failed to import libraries: {e}")
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
location = config_data.get("location", "us-central1")

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

def run_vertex_direct_coder(target_file_path, prompt, model_name="gemini-3.1-pro-custom-tools"):
    # 1. Read local file
    if not os.path.exists(target_file_path):
        print(f"Local file '{target_file_path}' not found. We will treat this as a NEW file creation.")
        original_code = ""
    else:
        with open(target_file_path, 'r', encoding='utf-8') as f:
            original_code = f.read()
        print(f"Loaded local file '{target_file_path}' ({len(original_code)} characters).")

    # 2. Setup prompts and custom system instructions for high-end coding
    system_instruction = (
        "You are an expert, world-class software engineer. "
        "Your task is to write and modify code based on the user's instructions. "
        "Always output the complete code wrapped inside a markdown code block starting with the language name (e.g. ```python or ```javascript). "
        "Do not write conversational filler; provide only the code block so our automation can parse it cleanly."
    )
    
    user_content = (
        f"File being modified: {os.path.basename(target_file_path)}\n\n"
        f"Original Code:\n"
        f"```\n{original_code}\n```\n\n"
        f"Instruction: {prompt}"
    )

    # 3. Get Credentials
    creds = get_gcloud_credentials()
    if not creds:
        print("Error getting credentials.")
        return

    # Map friendly model names to the registry model names and set correct location
    resolved_model = model_name
    resolved_location = location # Default is us-central1
    if model_name == "gemini-3.1-pro":
        resolved_model = "gemini-3.1-pro-preview"
        resolved_location = "global"
    elif model_name in ["gemini-3.1-pro-custom-tools", "gemini-3.1-pro-preview-customtools"]:
        resolved_model = "gemini-3.1-pro-preview-customtools"
        resolved_location = "global"
    elif model_name == "gemini-3.5-flash":
        resolved_model = "gemini-3.5-flash"
        resolved_location = "global"

    # 4. Initialize unified GenAI Client using Vertex AI backend
    print(f"Initializing Vertex AI client using model '{resolved_model}' in region '{resolved_location}' (requested: '{model_name}')...")
    client = genai.Client(
        vertexai=True,
        project=project_id,
        location=resolved_location,
        credentials=creds,
        http_options=types.HttpOptions(
            headers={
                "x-goog-user-project": project_id,
            }
        )
    )

    print("Generating code from Vertex AI model (this may take a few seconds as the model reasons)...")
    try:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.1,  # Keep it deterministic and precise for coding
        )
        
        response = client.models.generate_content(
            model=resolved_model,
            contents=user_content,
            config=config
        )
        
        agent_reply = response.text
        if not agent_reply:
            print("Error: Empty response received from Vertex AI model.")
            return

        # 5. Extract code from markdown block
        code_block_match = re.search(r"```[a-zA-Z#+-]*\n(.*?)```", agent_reply, re.DOTALL)
        
        if code_block_match:
            generated_code = code_block_match.group(1).strip()
            print("\nSuccessfully received and parsed code from Vertex AI!")
            
            # Write to local file
            with open(target_file_path, 'w', encoding='utf-8') as f:
                f.write(generated_code)
            print(f"SUCCESS: Written {len(generated_code)} characters back to local file '{target_file_path}'!")
        else:
            print("\nCould not find a structured markdown code block in the model's response.")
            print("Full response was:")
            print(agent_reply)
            
    except Exception as e:
        print(f"Failed to generate content: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 vertex_direct_coder.py <target_file_path> <prompt> [model_name: gemini-3.1-pro-custom-tools | gemini-3.1-pro | gemini-3.5-flash]")
        sys.exit(1)
        
    file_path = sys.argv[1]
    prompt = sys.argv[2]
    model = "gemini-3.1-pro-custom-tools"
    if len(sys.argv) > 3:
        model = sys.argv[3]
        
    run_vertex_direct_coder(file_path, prompt, model)
