import os
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

app = Flask(__name__)

config = load_app_config()

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
    # Minimal implementation - just return a message
    return jsonify({
        'status': 'success', 
        'message': 'Notebook execution would run here (requires cloud deployment for full functionality)'
    })

@app.route('/webhook', methods=['POST'])
def webhook():
    """Handle webhook from GitHub to update when the repo changes"""
    try:
        return jsonify({'status': 'success', 'message': 'Webhook received'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8100))
    print(f"🚀 Flask server starting on port {port}")
    print(f"📱 Simple notebook interface: http://localhost:{port}/")
    print(f"⚙️  Configuration interface: http://localhost:{port}/config")
    print("ℹ️  Note: Notebook execution requires cloud deployment for full functionality")
    app.run(host='0.0.0.0', port=port, debug=True)
