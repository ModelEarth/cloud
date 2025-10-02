# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Cloud Run project that provides a Flask web service for executing Jupyter notebooks from GitHub repositories. The service clones a source repository, executes a specified notebook using Papermill, and pushes generated files to a target repository.

**Key Components:**
- Flask web application (`app.py`) that serves a simple interface with a button to trigger notebook execution
- Google Cloud Run deployment with Secret Manager integration for GitHub tokens
- Webhook endpoint for automatic updates when source repository changes
- HTML interface (`page.html`) for manual notebook execution

## Development Environment Setup

The project uses Python virtual environments. Set up the development environment:

```bash
python3 -m venv env
source env/bin/activate  # On Windows: .\env\Scripts\activate
pip install -r requirements.txt
```

## Common Commands

### Local Development
```bash
# Activate virtual environment
source env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run Flask application locally in background
nohup python app.py > app.log 2>&1 &

# Check if server is running
curl http://localhost:8100

# View logs if needed
tail -f app.log
```

### Google Cloud Operations
```bash
# Initialize gcloud (run from cloud/run/site directory)
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
```

### Secret Management
```bash
# Create GitHub token secret
echo -n "your-github-token" | gcloud secrets create github-token --data-file=-

# Grant access to Cloud Run service account
gcloud secrets add-iam-policy-binding github-token \
    --member="serviceAccount:your-project-id@appspot.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

## Architecture

### Flask Application Structure
- **`app.py`**: Main Flask application with three key endpoints:
  - `/`: Serves the HTML interface
  - `/run-notebook` (POST): Clones repo, executes notebook with Papermill, triggers GitHub upload
  - `/webhook` (POST): Handles GitHub webhook for repository updates

### Configuration Variables (app.py:16-18)
- `SOURCE_REPO_URL`: GitHub repository containing the notebook to execute
- `TARGET_REPO`: Repository where generated files will be pushed
- `NOTEBOOK_PATH`: Path to the notebook file within the source repository

### Secret Manager Integration
GitHub tokens are stored in Google Cloud Secret Manager and accessed via the `get_github_token()` function. The notebook execution includes GitHub upload functionality that uses these stored credentials.

### Notebook Execution Flow
1. Flask endpoint receives POST request
2. Creates temporary directory and clones source repository
3. Executes notebook using Papermill with the specified parameters
4. Notebook contains `upload_reports_to_github()` function that pushes results to target repo
5. Returns success/error status as JSON

## Key Dependencies

- **Flask 2.0.1**: Web framework
- **Papermill 2.3.3**: Notebook execution engine
- **GitPython 3.1.24**: Git operations
- **google-cloud-secret-manager 2.8.0**: Credential management
- **nbconvert/nbformat**: Notebook processing

## GitHub Integration

The project requires two GitHub repositories and fine-grained personal access tokens with:
- Contents: Read and write
- Deployments: Read and write  
- Metadata: Read-only

Webhooks should be configured on the source repository pointing to `/webhook` endpoint for automatic updates on push to main branch.