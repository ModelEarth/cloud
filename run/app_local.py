import os
import tempfile
import subprocess
import requests
import json
from flask import Flask, render_template, request, jsonify
import git
import papermill as pm
import nbformat
from nbconvert import HTMLExporter
from utils.config_utils import load_config as load_app_config, save_config as save_app_config

# Load environment variables from .env file for local development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv not installed, skip loading .env file
    pass

app = Flask(__name__)

config = load_app_config()
SOURCE_REPO_URL = config['github']['source_repo_url']
TARGET_REPO = config['github']['target_repo']
NOTEBOOK_PATH = config['github']['notebook_path']

# Get the GitHub token from environment variable (local only version)
def get_github_token():
    # Get from environment variable for local development
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    else:
        raise Exception("GITHUB_TOKEN environment variable not set. Please set it in your .env file or environment.")

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
            config['project']['id'] = data['projectId']
        if 'projectName' in data:
            config['project']['name'] = data['projectName']
        if 'region' in data:
            config['project']['region'] = data['region']
        if 'sourceRepo' in data:
            config['github']['source_repo_url'] = data['sourceRepo']
        if 'targetRepo' in data:
            config['github']['target_repo'] = data['targetRepo']
        if 'notebookPath' in data:
            config['github']['notebook_path'] = data['notebookPath']
        if 'serviceName' in data:
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

@app.route('/run-notebook', methods=['POST'])
def run_notebook():
    try:
        # Create a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Clone the source repository
            repo = git.Repo.clone_from(SOURCE_REPO_URL, temp_dir)
            
            # Path to the notebook in the cloned repo
            notebook_file = os.path.join(temp_dir, NOTEBOOK_PATH)
            
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
            
            # The notebook execution will trigger the upload_reports_to_github function
            # which is defined in the notebook itself
            
            return jsonify({
                'status': 'success',
                'message': 'Notebook executed successfully'
            })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8100))
    print(f"Starting Flask server on port {port}")
    print("Access the simple notebook interface at: http://localhost:8100/")
    print("Access the configuration interface at: http://localhost:8100/config")
    app.run(host='0.0.0.0', port=port, debug=True)
