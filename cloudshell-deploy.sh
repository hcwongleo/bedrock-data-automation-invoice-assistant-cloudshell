#!/bin/bash

# Invoice Processor - Complete CloudShell Deployment Script
# This script handles all deployment steps for AWS CloudShell environment
# Prerequisites: Run this in AWS CloudShell with appropriate IAM permissions

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main deployment function
main() {
    echo "========================================"
    echo "Invoice Processor - CloudShell Deployment"
    echo "========================================"
    
    # Step 1: Environment Setup
    log_info "Setting up CloudShell environment..."
    setup_environment
    
    # Step 2: Install Dependencies
    log_info "Installing project dependencies..."
    install_dependencies
    
    # Step 3: CDK Bootstrap
    log_info "Bootstrapping CDK..."
    bootstrap_cdk
    
    # Step 4: Deploy Backend
    log_info "Deploying backend infrastructure..."
    deploy_backend
    
    # Step 5: Deploy Frontend
    log_info "Deploying frontend application..."
    deploy_frontend
    
    # Step 6: Get Application URL
    log_info "Retrieving application URL..."
    get_application_url
    
    log_success "Deployment completed successfully!"
}

# Setup CloudShell environment
setup_environment() {
    # Update system packages
    log_info "Updating system packages..."
    sudo yum update -y || true
    
    # Install Node.js 22 if not present or wrong version
    NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
    if [ "$NODE_VERSION" -lt "22" ]; then
        log_info "Installing Node.js 22..."
        curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
        sudo yum install -y nodejs
    else
        log_success "Node.js 22+ already installed"
    fi
    
    # Verify AWS CLI is available (should be pre-installed in CloudShell)
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Please ensure you're running in AWS CloudShell."
        exit 1
    fi
    
    # Get AWS account info
    REGION=$(aws configure get region || aws configure get default.region || echo "us-east-1")
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    log_success "Environment setup complete"
    log_info "AWS Region: $REGION"
    log_info "AWS Account: $ACCOUNT_ID"
}

# Install project dependencies
install_dependencies() {
    # Set npm registry
    npm config set registry=https://registry.npmjs.com/
    
    # Install root dependencies
    log_info "Installing root dependencies..."
    npm install
    
    # Install infra dependencies
    log_info "Installing infrastructure dependencies..."
    cd packages/infra
    npm install
    cd ../..
    
    # Install webapp dependencies
    log_info "Installing webapp dependencies..."
    cd packages/webapp
    npm install
    cd ../..
    
    # Install global CDK if not present
    if ! command -v cdk &> /dev/null; then
        log_info "Installing AWS CDK globally..."
        npm install -g aws-cdk@latest
    fi
    
    log_success "Dependencies installed successfully"
}

# Bootstrap CDK
bootstrap_cdk() {
    REGION=$(aws configure get region || aws configure get default.region || echo "us-east-1")
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    log_info "Checking CDK bootstrap status for account $ACCOUNT_ID in region $REGION..."
    
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" >/dev/null 2>&1; then
        log_info "Bootstrapping CDK for aws://$ACCOUNT_ID/$REGION..."
        cdk bootstrap "aws://$ACCOUNT_ID/$REGION"
        log_success "CDK bootstrapped successfully"
    else
        log_success "CDK already bootstrapped"
    fi
}

# Deploy backend infrastructure
deploy_backend() {
    log_info "Building and deploying backend infrastructure..."
    
    # Build TypeScript
    cd packages/infra
    npm run build
    
    # Synthesize CDK app
    log_info "Synthesizing CDK application..."
    npm run synth
    
    # Deploy all stacks
    log_info "Deploying all CDK stacks..."
    npm run cdk -- deploy --all --require-approval never
    
    cd ../..
    log_success "Backend deployment completed"
}

# Deploy frontend application
deploy_frontend() {
    log_info "Deploying frontend application..."
    
    # Run the frontend deployment script
    npx tsx scripts/deploy-website.ts
    
    log_success "Frontend deployment completed"
}

# Get application URL
get_application_url() {
    log_info "Retrieving application URL..."
    
    # Wait a moment for stack outputs to be available
    sleep 5
    
    # Try to get CloudFront URL
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name $(aws cloudformation list-stacks \
            --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
            --query 'StackSummaries[?starts_with(StackName, `AutoInvoiceAPPwebsitewafstack`)].StackName' \
            --output text 2>/dev/null) \
        --query 'Stacks[0].Outputs[?OutputKey==`configwebsitedistributiondomain`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    echo ""
    echo "========================================"
    echo "           DEPLOYMENT SUMMARY"
    echo "========================================"
    
    if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "None" ] && [ "$CLOUDFRONT_URL" != "" ]; then
        log_success "Application deployed successfully!"
        echo ""
        echo "🌐 Application URL: https://$CLOUDFRONT_URL"
        echo ""
    else
        log_warning "Could not retrieve CloudFront URL automatically"
        echo ""
        echo "Please check the AWS Console for your CloudFront distribution URL:"
        echo "1. Go to CloudFormation in AWS Console"
        echo "2. Find the stack starting with 'AutoInvoiceAPPwebsitewafstack'"
        echo "3. Check the Outputs tab for the website URL"
        echo ""
    fi
    
    echo "📊 You can also check the following AWS services:"
    echo "   - CloudFormation: View all deployed stacks"
    echo "   - S3: Website files bucket"
    echo "   - CloudFront: CDN distribution"
    echo "   - AppSync: GraphQL API"
    echo "   - Lambda: Backend functions"
    echo ""
}

# Error handling
trap 'log_error "Deployment failed at line $LINENO. Check the error above."; exit 1' ERR

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    log_error "Please run this script from the project root directory"
    exit 1
fi

# Run main deployment
main

log_success "All done! 🚀"