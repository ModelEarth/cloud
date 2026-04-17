from flask import Blueprint, request, jsonify
from utils.auth_utils import require_token
from utils.config_utils import load_config, save_config
from utils.github_utils import get_github_token
from utils.notebook_utils import SOURCE_REPO_URL, TARGET_REPO, NOTEBOOK_PATH, NOTEBOOK_EXECUTION_AVAILABLE
import nbformat
import os
import sys
import json
import subprocess

# Check if running on Google Cloud
try:
    from google.cloud import secretmanager
    CLOUD_AVAILABLE = True
except ImportError:
    CLOUD_AVAILABLE = False

core_blueprint = Blueprint('core', __name__)

@core_blueprint.route('/')
def home():
    try:
        with open('page.html', 'r') as f:
            return f.read()
    except Exception as e:
        print(f"[ERROR] Failed to load homepage: {e}", file=sys.stderr)
        return "<h2>Error loading homepage</h2>", 500

@core_blueprint.route('/config')
def config_page():
    with open('index.html', 'r') as f:
        return f.read()

@core_blueprint.route('/get-config', methods=['GET'])
@require_token
def get_config_route():
    try:
        config = load_config()
        return jsonify({
            'status': 'success',
            'config': config
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@core_blueprint.route('/save-config', methods=['POST'])
@require_token
def save_config_route():
    try:
        data = request.json
        config = load_config()

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
        save_config(config)

        # Configuration is saved to file, will be reloaded on next request
        # Note: In production, you might want to implement proper config reloading

        return jsonify({
            'status': 'success',
            'message': 'Configuration saved successfully'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@core_blueprint.route('/update-env', methods=['POST'])
def update_env():
    """Write key/value pairs to docker/.env without touching unrelated lines."""
    try:
        updates = request.get_json(force=True, silent=True) or {}
        if not updates:
            return jsonify({'status': 'error', 'message': 'No values provided'}), 400

        webroot = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
        env_path = os.path.join(webroot, 'docker', '.env')

        # Read existing lines
        lines = []
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                lines = f.readlines()

        # Update or append each key
        for key, value in updates.items():
            key = key.strip()
            updated = False
            for i, line in enumerate(lines):
                if line.startswith(key + '=') or line.startswith(key + ' ='):
                    lines[i] = f'{key}={value}\n'
                    updated = True
                    break
            if not updated:
                lines.append(f'{key}={value}\n')

        with open(env_path, 'w') as f:
            f.writelines(lines)

        return jsonify({'status': 'success', 'message': f'docker/.env updated ({", ".join(updates.keys())})'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@core_blueprint.route('/status')
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

@core_blueprint.route('/webhook', methods=['POST'])
@require_token
def webhook():
    """Handle webhook from GitHub to update when the repo changes"""
    try:
        payload = request.json
        print(f"[DEBUG] Webhook payload: {json.dumps(payload)}", file=sys.stderr)

        if payload.get('ref') == 'refs/heads/main':
            subprocess.run(["git", "pull"], cwd="/app")
            print("[DEBUG] Git pull triggered", file=sys.stderr)
            return jsonify({'status': 'success'})
        return jsonify({'status': 'no action'})
    except Exception as e:
        print(f"[ERROR] Webhook handler failed: {e}", file=sys.stderr)
        return jsonify({'status': 'error', 'message': str(e)}), 500
