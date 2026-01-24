# Cloud - AI CLI Guide

This file provides guidance to Claude Code (claude.ai/code) and other AI CLI processes when working with the cloud repository.

## Overview

The cloud repository provides Google Cloud Run integration for executing Jupyter notebooks from GitHub repositories. It includes:
- **Flask Web Service**: Executes notebooks using Papermill
- **GitHub Integration**: Clones source repos, executes notebooks, pushes results to target repos
- **Google Cloud Deployment**: Containerized deployment with Secret Manager integration
- **Webhook Support**: Automatic updates when source repository changes

**Key Components:**
- Flask web application (`run/app.py`) that serves an interface with a button to trigger notebook execution
- Google Cloud Run deployment with Secret Manager integration for GitHub tokens
- Webhook endpoint for automatic updates when source repository changes
- HTML interface for manual notebook execution

## Development Commands

### Start Cloud Flask Server

When you type "start cloud", ask the user:

**Question:** "Do you want to start the Flask server locally for development, or deploy to Google Cloud Run?"

**Options:**
1. **Local Development** - Start Flask server on port 8100 locally
2. **Deploy to Google Cloud** - Deploy to Google Cloud Run

#### Option 1: Local Development

```bash
# Check if cloud/run Flask server is already running on port 8100
if lsof -ti:8100 > /dev/null 2>&1; then
  echo "Cloud run Flask server already running on port 8100"
else
  # Navigate to cloud/run
  cd cloud/run

  # Create virtual environment if it doesn't exist
  if [ ! -d "env" ]; then
    python3 -m venv env
  fi

  # Activate virtual environment
  source env/bin/activate

  # Install dependencies if requirements.txt exists
  if [ -f "requirements.txt" ]; then
    pip install -q -r requirements.txt
  fi

  # Install Flask and CORS if not already installed
  pip install -q flask flask-cors

  # Start Flask server in background
  nohup python app.py > flask.log 2>&1 &

  echo "Started cloud run Flask server on port 8100"
  echo "Health check: http://localhost:8100/health"
  echo "Cloud run API: http://localhost:8100/"

  # Return to webroot
  cd ../..
fi
```

**What this does:**
- Starts Flask server on port 8100 for local development
- Executes Jupyter notebooks from GitHub repositories
- Handles notebook execution and GitHub integration
- Uses virtual environment in `cloud/run/env/`
- Runs in background with output logged to `cloud/run/flask.log`

**Verify server is running:**
```bash
curl http://localhost:8100/health
```

**Stop the server:**
```bash
lsof -ti:8100 | xargs kill
```

**View logs:**
```bash
tail -f cloud/run/flask.log
```

#### Option 2: Deploy to Google Cloud

```bash
# Navigate to cloud/run
cd cloud/run

# Initialize gcloud (if not already done)
gcloud init --skip-diagnostics

# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/your-project-id/notebook-executor
gcloud run deploy notebook-executor \
  --image gcr.io/your-project-id/notebook-executor \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=your-project-id"

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=notebook-executor" --limit 50

# Return to webroot
cd ../..
```

**What this does:**
- Builds Docker container from Dockerfile
- Deploys to Google Cloud Run
- Configures environment variables and permissions
- Makes service publicly accessible

## Development Environment Setup

The project uses Python virtual environments for local development:

```bash
cd cloud/run
python3 -m venv env
source env/bin/activate  # On Windows: .\env\Scripts\activate
pip install -r requirements.txt
```

## Architecture

### Flask Application Structure
- **`run/app.py`**: Main Flask application with key endpoints:
  - `/`: Serves the HTML interface
  - `/run-notebook` (POST): Clones repo, executes notebook with Papermill, triggers GitHub upload
  - `/webhook` (POST): Handles GitHub webhook for repository updates
  - `/health` (GET): Health check endpoint

### Configuration
Environment variables and configuration:
- `PORT`: Server port (default: 8100)
- `SOURCE_REPO_URL`: GitHub repository containing the notebook to execute
- `TARGET_REPO`: Repository where generated files will be pushed
- `NOTEBOOK_PATH`: Path to the notebook file within the source repository

### Secret Manager Integration
GitHub tokens are stored in Google Cloud Secret Manager and accessed via the `get_github_token()` function. The notebook execution includes GitHub upload functionality that uses these stored credentials.

### Notebook Execution Flow
1. Flask endpoint receives POST request
2. Creates temporary directory and clones source repository
3. Executes notebook using Papermill with specified parameters
4. Notebook contains `upload_reports_to_github()` function that pushes results to target repo
5. Returns success/error status as JSON

## Key Dependencies

- **Flask 2.0.1**: Web framework
- **Papermill 2.3.3**: Notebook execution engine
- **GitPython 3.1.24**: Git operations
- **google-cloud-secret-manager 2.8.0**: Credential management
- **nbconvert/nbformat**: Notebook processing
- **flask-cors**: CORS support for API

## Google Cloud Setup

### Secret Management
```bash
# Create GitHub token secret
echo -n "your-github-token" | gcloud secrets create github-token --data-file=-

# Grant access to Cloud Run service account
gcloud secrets add-iam-policy-binding github-token \
    --member="serviceAccount:your-project-id@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### GitHub Integration

The project requires two GitHub repositories and fine-grained personal access tokens with:
- Contents: Read and write
- Deployments: Read and write
- Metadata: Read-only

Webhooks should be configured on the source repository pointing to `/webhook` endpoint for automatic updates on push to main branch.

## Local Development

### Running Locally
```bash
# Activate virtual environment
source cloud/run/env/bin/activate

# Install dependencies
pip install -r cloud/run/requirements.txt

# Run Flask application
python cloud/run/app.py

# Check if server is running
curl http://localhost:8100/health
```

### View Logs
```bash
# View Flask logs
tail -f cloud/run/flask.log

# View application logs
tail -f cloud/run/app.log
```

## Development Standards

- **Virtual Environment**: Cloud Flask server uses dedicated virtual environment in `cloud/run/env/`
- **Port Assignment**: Cloud Flask uses port 8100 (different from data-pipeline on 5001)
- **Environment Variables**: Configuration via .env file (use .env.example as template)
- **Google Cloud Integration**: Designed for containerized deployment to Cloud Run

## Related Documentation

- **Cloud Run README**: [cloud/run/README.md](run/README.md)
- **Main Webroot Guide**: [team/CLAUDE.md](../team/CLAUDE.md)
- **Data Pipeline Guide**: [data-pipeline/AGENTS.md](../data-pipeline/AGENTS.md)
