#!/bin/bash

# Automated Google Cloud Run Deployment Script
# This script reads from config.yaml and .env to deploy the notebook executor service

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables if .env exists
if [ -f .env ]; then
    echo -e "${GREEN}Loading environment variables from .env${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found. Using defaults from config.yaml${NC}"
fi

# Parse config.yaml using Python (more portable than yq)
eval $(python3 -c "
import yaml
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)
print(f'PROJECT_ID=\"{config[\"project\"][\"id\"]}\"')
print(f'PROJECT_NAME=\"{config[\"project\"][\"name\"]}\"')
print(f'REGION=\"{config[\"project\"][\"region\"]}\"')
print(f'SERVICE_NAME=\"{config[\"service\"][\"name\"]}\"')
print(f'IMAGE_NAME=\"{config[\"container\"][\"image_name\"]}\"')
print(f'SOURCE_REPO_URL=\"{config[\"github\"][\"source_repo_url\"]}\"')
print(f'TARGET_REPO=\"{config[\"github\"][\"target_repo\"]}\"')
print(f'NOTEBOOK_PATH=\"{config[\"github\"][\"notebook_path\"]}\"')
")

echo -e "${GREEN}Starting deployment for project: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Config values:${NC}"
echo "  PROJECT_ID: ${PROJECT_ID}"
echo "  SERVICE_NAME: ${SERVICE_NAME}"
echo "  IMAGE_NAME: ${IMAGE_NAME}"
echo "  REGION: ${REGION}"

# Check if gcloud is installed
if ! command -v gcloud >/dev/null 2>&1; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Initialize gcloud if needed
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
if ! gcloud config get-value project >/dev/null 2>&1; then
    echo -e "${YELLOW}Initializing gcloud...${NC}"
    gcloud init --skip-diagnostics
fi

# Set the project
echo -e "${GREEN}Setting project to ${PROJECT_ID}${NC}"
gcloud config set project ${PROJECT_ID}

# Check if project exists and we have access
if gcloud projects describe ${PROJECT_ID} >/dev/null 2>&1; then
    echo -e "${GREEN}Using existing project ${PROJECT_ID}${NC}"
else
    echo -e "${YELLOW}Creating project ${PROJECT_ID}...${NC}"
    gcloud projects create ${PROJECT_ID} --name="${PROJECT_NAME:-ModelEarth Run Models}"
    
    if [ -n "${GOOGLE_BILLING_ID}" ]; then
        echo -e "${GREEN}Linking billing account...${NC}"
        gcloud billing projects link ${PROJECT_ID} --billing-account=${GOOGLE_BILLING_ID}
    else
        echo -e "${YELLOW}Warning: No billing account specified. You may need to link one manually.${NC}"
    fi
fi

# Enable required APIs
echo -e "${GREEN}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create GitHub token secret if provided
if [ -n "${GITHUB_TOKEN}" ] && [ "${GITHUB_TOKEN}" != "placeholder-token-needs-user-input" ]; then
    echo -e "${GREEN}Creating GitHub token secret...${NC}"
    echo -n "${GITHUB_TOKEN}" | gcloud secrets create github-token --data-file=- || echo "Secret may already exist"
    
    # Get the project number for the default compute service account
    PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
    
    # Grant access to default compute service account
    gcloud secrets add-iam-policy-binding github-token \
        --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" || echo "Permission may already exist"
fi

# Build and deploy the container
echo -e "${GREEN}Building and deploying container...${NC}"
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest

echo -e "${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Set up GitHub webhook pointing to: ${SERVICE_URL}/webhook"
echo "2. Configure your source and target repositories in app.py"
echo "3. Test the deployment by visiting: ${SERVICE_URL}"

# Update .env with service URL if it exists
if [ -f .env ]; then
    if grep -q "CLOUD_RUN_URL=" .env; then
        sed -i.bak "s|CLOUD_RUN_URL=.*|CLOUD_RUN_URL=${SERVICE_URL}|" .env
    else
        echo "CLOUD_RUN_URL=${SERVICE_URL}" >> .env
    fi
    echo -e "${GREEN}Updated .env with service URL${NC}"
fi