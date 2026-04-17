# Import compatibility fixes first
try:
    import fix_imports
except ImportError:
    pass

import os
import tempfile
import subprocess
import requests
import json
from flask import Flask, render_template, request, jsonify
from utils.config_utils import load_config as load_app_config, save_config as save_app_config

# Load environment variables from .env file for local development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv not installed, skip loading .env file
    pass

# Try to import Google Cloud dependencies (for cloud deployment)
try:
    from google.cloud import secretmanager
    CLOUD_AVAILABLE = True
except ImportError:
    CLOUD_AVAILABLE = False
    print("⚠️  Google Cloud dependencies not available - running in local mode")

# Try to import notebook execution dependencies
try:
    import git
    import papermill as pm
    import nbformat
    from nbconvert import HTMLExporter
    NOTEBOOK_EXECUTION_AVAILABLE = True
    print("✅ Notebook execution dependencies available")
except ImportError as e:
    NOTEBOOK_EXECUTION_AVAILABLE = False
    print(f"⚠️  Notebook execution dependencies not available: {e}")
    print("📝 Local interface will work, but notebook execution will be simulated")

app = Flask(__name__)

config = load_app_config()
SOURCE_REPO_URL = config['github']['source_repo_url']
TARGET_REPO = config['github']['target_repo']
NOTEBOOK_PATH = config['github']['notebook_path']

# Get the GitHub token from environment variable or Secret Manager
def get_github_token():
    # First try to get from environment variable (for local development)
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    
    # Fallback to Secret Manager (for cloud deployment)
    if CLOUD_AVAILABLE:
        try:
            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{os.environ.get('GOOGLE_CLOUD_PROJECT')}/secrets/github-token/versions/latest"
            response = client.access_secret_version(request={"name": name})
            return response.payload.data.decode("UTF-8")
        except Exception as e:
            raise Exception(f"Could not get GitHub token from environment variable or Secret Manager: {e}")
    else:
        raise Exception("GITHUB_TOKEN environment variable not set and Google Cloud not available")

@app.route('/')
def home():
    with open('page.html', 'r') as f:
        return f.read()

@app.route('/config')
def config_page():
    with open('index.html', 'r') as f:
        return f.read()

@app.route('/get-config', methods=['GET'])
def get_config():
    try:
        config = load_app_config()
        return jsonify({
            'status': 'success',
            'config': config
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/save-config', methods=['POST'])
def save_config():
    try:
        data = request.json
        config = load_app_config()
        
        # Update configuration with form data
        if 'projectId' in data:
            if 'project' not in config:
                config['project'] = {}
            config['project']['id'] = data['projectId']
        if 'projectName' in data:
            if 'project' not in config:
                config['project'] = {}
            config['project']['name'] = data['projectName']
        if 'region' in data:
            if 'project' not in config:
                config['project'] = {}
            config['project']['region'] = data['region']
        if 'sourceRepo' in data:
            if 'github' not in config:
                config['github'] = {}
            config['github']['source_repo_url'] = data['sourceRepo']
        if 'targetRepo' in data:
            if 'github' not in config:
                config['github'] = {}
            config['github']['target_repo'] = data['targetRepo']
        if 'notebookPath' in data:
            if 'github' not in config:
                config['github'] = {}
            config['github']['notebook_path'] = data['notebookPath']
        if 'serviceName' in data:
            if 'service' not in config:
                config['service'] = {}
            config['service']['name'] = data['serviceName']
        
        # Save updated configuration to the repo-local config path.
        save_app_config(config)
        
        # Update global variables
        global SOURCE_REPO_URL, TARGET_REPO, NOTEBOOK_PATH
        SOURCE_REPO_URL = config['github']['source_repo_url']
        TARGET_REPO = config['github']['target_repo']
        NOTEBOOK_PATH = config['github']['notebook_path']
        
        return jsonify({
            'status': 'success',
            'message': 'Configuration saved successfully'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def execute_notebook_with_dependencies():
    """Execute notebook with full dependencies (papermill, git, etc.)"""
    try:
        # Create a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"🔄 Cloning repository: {SOURCE_REPO_URL}")
            # Clone the source repository
            repo = git.Repo.clone_from(SOURCE_REPO_URL, temp_dir)
            
            # Path to the notebook in the cloned repo
            notebook_file = os.path.join(temp_dir, NOTEBOOK_PATH)
            print(f"📓 Executing notebook: {notebook_file}")
            
            # Execute the notebook
            output_path = os.path.join(temp_dir, 'output.ipynb')
            pm.execute_notebook(
                notebook_file,
                output_path,
                parameters={}
            )
            
            # Read the executed notebook
            with open(output_path, 'r') as f:
                nb = nbformat.read(f, as_version=4)
            
            # Convert to HTML for display
            html_exporter = HTMLExporter()
            html_data, resources = html_exporter.from_notebook_node(nb)
            
            print("✅ Notebook executed successfully")
            return {
                'status': 'success',
                'message': 'Notebook executed successfully'
            }
    except Exception as e:
        print(f"❌ Notebook execution failed: {e}")
        return {
            'status': 'error',
            'message': f'Notebook execution failed: {str(e)}'
        }

def execute_notebook_simulation():
    """Simulate notebook execution when dependencies are not available"""
    print("🔄 Simulating notebook execution (dependencies not available)")
    return {
        'status': 'success',
        'message': 'Notebook execution simulated successfully (install dependencies for full functionality)'
    }

@app.route('/run-notebook', methods=['POST'])
def run_notebook():
    if NOTEBOOK_EXECUTION_AVAILABLE:
        return jsonify(execute_notebook_with_dependencies())
    else:
        return jsonify(execute_notebook_simulation())

@app.route('/webhook', methods=['POST'])
def webhook():
    """Handle webhook from GitHub to update when the repo changes"""
    try:
        payload = request.json
        if 'ref' in payload and payload['ref'] == 'refs/heads/main':
            # Pull the latest changes
            subprocess.run(["git", "pull"], cwd="/app")
            return jsonify({'status': 'success'})
        return jsonify({'status': 'no action'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/status')
def status():
    """Show system status and available features"""
    return jsonify({
        'environment': 'local' if not CLOUD_AVAILABLE else 'cloud',
        'cloud_available': CLOUD_AVAILABLE,
        'notebook_execution_available': NOTEBOOK_EXECUTION_AVAILABLE,
        'github_token_configured': bool(os.environ.get('GITHUB_TOKEN')),
        'config': {
            'source_repo': SOURCE_REPO_URL,
            'target_repo': TARGET_REPO,
            'notebook_path': NOTEBOOK_PATH
        }
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8100))
    
    print("🚀 Starting unified Flask server")
    print(f"🌐 Server URL: http://localhost:{port}")
    print(f"📱 Simple interface: http://localhost:{port}/")
    print(f"⚙️  Configuration: http://localhost:{port}/config")
    print(f"📊 System status: http://localhost:{port}/status")
    print()
    print("📋 System capabilities:")
    print(f"  • Google Cloud integration: {'✅' if CLOUD_AVAILABLE else '❌'}")
    print(f"  • Notebook execution: {'✅' if NOTEBOOK_EXECUTION_AVAILABLE else '❌'}")
    print(f"  • GitHub token configured: {'✅' if os.environ.get('GITHUB_TOKEN') else '❌'}")
    
    app.run(host='0.0.0.0', port=port, debug=True)
