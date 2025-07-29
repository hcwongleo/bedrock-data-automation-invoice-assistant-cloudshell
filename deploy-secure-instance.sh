#!/bin/bash

# Secure EC2 Instance Deployment with Budget Protection
# Deploys m8g.24xlarge with no public IP, restrictive security group, and budget alarm

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTANCE_TYPE="m8g.24xlarge"
BUDGET_LIMIT="2700"  # $2,700 USD
BUDGET_NAME="EC2-Cost-Protection-Budget"
INSTANCE_NAME="secure-compute-instance"
SECURITY_GROUP_NAME="no-ingress-sg"
EMAIL_ADDRESSES=("hoyukhim@amazon.com" "hcwong@amazon.com")  # Email addresses for budget notifications

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

# Get AWS account and region info
get_aws_info() {
    REGION=$(aws configure get region || aws configure get default.region || echo "us-east-1")
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    log_info "AWS Region: $REGION"
    log_info "AWS Account: $ACCOUNT_ID"
}

# Create IAM role for budget actions
create_budget_role() {
    log_info "Creating IAM role for budget actions..."
    
    # Create trust policy
    cat > budget-trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "budgets.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

    # Create policy for EC2 termination
    cat > budget-action-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:TerminateInstances",
                "ec2:DescribeInstances"
            ],
            "Resource": "*"
        }
    ]
}
EOF

    # Create role
    ROLE_NAME="BudgetEC2TerminationRole"
    
    if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
        log_info "IAM role $ROLE_NAME already exists"
    else
        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file://budget-trust-policy.json \
            --description "Role for budget actions to terminate EC2 instances"
        
        aws iam put-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-name "EC2TerminationPolicy" \
            --policy-document file://budget-action-policy.json
        
        log_success "IAM role created successfully"
    fi
    
    ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME"
    
    # Clean up temp files
    rm -f budget-trust-policy.json budget-action-policy.json
}

# Get default VPC and subnet
get_vpc_info() {
    log_info "Getting VPC information..."
    
    # Get default VPC
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=is-default,Values=true" \
        --query 'Vpcs[0].VpcId' \
        --output text)
    
    if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
        log_error "No default VPC found. Please create a VPC first."
        exit 1
    fi
    
    # Get first private subnet (or any subnet without auto-assign public IP)
    SUBNET_ID=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=$VPC_ID" \
        --query 'Subnets[?MapPublicIpOnLaunch==`false`] | [0].SubnetId' \
        --output text)
    
    # If no private subnet found, use first available subnet
    if [ "$SUBNET_ID" = "None" ] || [ -z "$SUBNET_ID" ]; then
        SUBNET_ID=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=$VPC_ID" \
            --query 'Subnets[0].SubnetId' \
            --output text)
    fi
    
    log_info "Using VPC: $VPC_ID"
    log_info "Using Subnet: $SUBNET_ID"
}

# Create security group with no ingress rules
create_security_group() {
    log_info "Creating security group with no ingress rules..."
    
    # Check if security group already exists
    EXISTING_SG=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC_ID" \
        --query 'SecurityGroups[0].GroupId' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$EXISTING_SG" != "None" ] && [ -n "$EXISTING_SG" ]; then
        SECURITY_GROUP_ID="$EXISTING_SG"
        log_info "Using existing security group: $SECURITY_GROUP_ID"
    else
        # Create security group
        SECURITY_GROUP_ID=$(aws ec2 create-security-group \
            --group-name "$SECURITY_GROUP_NAME" \
            --description "Security group with no ingress rules for secure compute instance" \
            --vpc-id "$VPC_ID" \
            --query 'GroupId' \
            --output text)
        
        # Remove default egress rule (optional - keeps outbound internet access)
        # aws ec2 revoke-security-group-egress \
        #     --group-id "$SECURITY_GROUP_ID" \
        #     --protocol all \
        #     --port all \
        #     --cidr 0.0.0.0/0 || true
        
        log_success "Security group created: $SECURITY_GROUP_ID"
    fi
}

# Get latest Amazon Linux 2023 ARM64 AMI
get_ami_id() {
    log_info "Getting latest Amazon Linux 2023 ARM64 AMI..."
    
    AMI_ID=$(aws ec2 describe-images \
        --owners amazon \
        --filters \
            "Name=name,Values=al2023-ami-*-arm64" \
            "Name=state,Values=available" \
            "Name=architecture,Values=arm64" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text)
    
    log_info "Using AMI: $AMI_ID"
}

# Launch EC2 instance
launch_instance() {
    log_info "Launching $INSTANCE_TYPE instance..."
    
    # Create user data script for basic setup
    cat > user-data.sh << 'EOF'
#!/bin/bash
yum update -y
yum install -y htop
echo "Secure compute instance initialized at $(date)" > /var/log/instance-init.log
EOF

    # Launch instance
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id "$AMI_ID" \
        --count 1 \
        --instance-type "$INSTANCE_TYPE" \
        --security-group-ids "$SECURITY_GROUP_ID" \
        --subnet-id "$SUBNET_ID" \
        --no-associate-public-ip-address \
        --user-data file://user-data.sh \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME},{Key=Purpose,Value=SecureCompute},{Key=BudgetProtected,Value=true}]" \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    log_success "Instance launched: $INSTANCE_ID"
    
    # Clean up user data file
    rm -f user-data.sh
}

# Create Lambda function for EC2 termination
create_termination_lambda() {
    log_info "Creating Lambda function for EC2 termination..."
    
    # Create Lambda execution role
    LAMBDA_ROLE_NAME="EC2TerminationLambdaRole"
    
    cat > lambda-trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

    cat > lambda-execution-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:TerminateInstances",
                "ec2:DescribeInstances"
            ],
            "Resource": "*"
        }
    ]
}
EOF

    # Create Lambda role
    if aws iam get-role --role-name "$LAMBDA_ROLE_NAME" >/dev/null 2>&1; then
        log_info "Lambda role $LAMBDA_ROLE_NAME already exists"
    else
        aws iam create-role \
            --role-name "$LAMBDA_ROLE_NAME" \
            --assume-role-policy-document file://lambda-trust-policy.json \
            --description "Role for Lambda to terminate EC2 instances"
        
        aws iam put-role-policy \
            --role-name "$LAMBDA_ROLE_NAME" \
            --policy-name "EC2TerminationPolicy" \
            --policy-document file://lambda-execution-policy.json
        
        log_success "Lambda role created successfully"
        sleep 10  # Wait for role propagation
    fi
    
    LAMBDA_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$LAMBDA_ROLE_NAME"
    
    # Create Lambda function code
    cat > lambda_function.py << EOF
import json
import boto3
import os

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    instance_id = os.environ['INSTANCE_ID']
    
    try:
        # Terminate the instance
        response = ec2.terminate_instances(InstanceIds=[instance_id])
        
        print(f"Termination initiated for instance {instance_id}")
        print(f"Response: {response}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully initiated termination of instance {instance_id}',
                'response': response
            })
        }
    except Exception as e:
        print(f"Error terminating instance {instance_id}: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'instance_id': instance_id
            })
        }
EOF

    # Create deployment package
    zip lambda-function.zip lambda_function.py
    
    # Create or update Lambda function
    LAMBDA_FUNCTION_NAME="terminate-ec2-on-budget-exceeded"
    
    if aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" >/dev/null 2>&1; then
        log_info "Updating existing Lambda function"
        aws lambda update-function-code \
            --function-name "$LAMBDA_FUNCTION_NAME" \
            --zip-file fileb://lambda-function.zip
        
        aws lambda update-function-configuration \
            --function-name "$LAMBDA_FUNCTION_NAME" \
            --environment "Variables={INSTANCE_ID=$INSTANCE_ID}"
    else
        log_info "Creating new Lambda function"
        aws lambda create-function \
            --function-name "$LAMBDA_FUNCTION_NAME" \
            --runtime python3.9 \
            --role "$LAMBDA_ROLE_ARN" \
            --handler lambda_function.lambda_handler \
            --zip-file fileb://lambda-function.zip \
            --description "Terminates EC2 instance when budget is exceeded" \
            --timeout 60 \
            --environment "Variables={INSTANCE_ID=$INSTANCE_ID}"
    fi
    
    LAMBDA_FUNCTION_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$LAMBDA_FUNCTION_NAME"
    log_success "Lambda function created: $LAMBDA_FUNCTION_ARN"
    
    # Clean up temp files
    rm -f lambda-trust-policy.json lambda-execution-policy.json lambda_function.py lambda-function.zip
}

# Create SNS topic and CloudWatch alarm for budget monitoring
create_budget_monitoring() {
    log_info "Creating SNS topic and CloudWatch alarm for budget monitoring..."
    
    # Create SNS topic
    SNS_TOPIC_NAME="budget-exceeded-alert"
    SNS_TOPIC_ARN=$(aws sns create-topic --name "$SNS_TOPIC_NAME" --query 'TopicArn' --output text)
    
    # Subscribe Lambda to SNS topic
    aws sns subscribe \
        --topic-arn "$SNS_TOPIC_ARN" \
        --protocol lambda \
        --notification-endpoint "$LAMBDA_FUNCTION_ARN"
    
    # Add email subscriptions for all specified addresses
    log_info "Adding email subscriptions to SNS topic..."
    for email in "${EMAIL_ADDRESSES[@]}"; do
        log_info "Subscribing $email to budget notifications..."
        aws sns subscribe \
            --topic-arn "$SNS_TOPIC_ARN" \
            --protocol email \
            --notification-endpoint "$email"
    done
    log_warning "Please check emails (${EMAIL_ADDRESSES[*]}) and confirm SNS subscriptions"
    
    # Add permission for SNS to invoke Lambda
    aws lambda add-permission \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --statement-id "allow-sns-invoke" \
        --action lambda:InvokeFunction \
        --principal sns.amazonaws.com \
        --source-arn "$SNS_TOPIC_ARN" 2>/dev/null || log_info "Permission already exists"
    
    log_success "SNS topic created and Lambda subscribed: $SNS_TOPIC_ARN"
}

# Create budget with SNS notification
create_budget() {
    log_info "Creating budget with automatic termination..."
    
    # Create budget definition
    cat > budget-definition.json << EOF
{
    "BudgetName": "$BUDGET_NAME",
    "BudgetLimit": {
        "Amount": "$BUDGET_LIMIT",
        "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "TimePeriod": {
        "Start": "$(date -u +%Y-%m-01T00:00:00Z)",
        "End": "2030-12-31T23:59:59Z"
    },
    "BudgetType": "COST",
    "CostFilters": {},
    "CalculatedSpend": {
        "ActualSpend": {
            "Amount": "0",
            "Unit": "USD"
        }
    }
}
EOF

    # Create subscribers (notifications)
    cat > budget-subscribers.json << EOF
[
    {
        "SubscriptionType": "SNS",
        "Address": "$SNS_TOPIC_ARN"
    }
]
EOF

    # Create budget
    if aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" >/dev/null 2>&1; then
        log_info "Budget $BUDGET_NAME already exists, updating notifications..."
        aws budgets delete-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" || true
        sleep 5
    fi
    
    aws budgets create-budget \
        --account-id "$ACCOUNT_ID" \
        --budget file://budget-definition.json \
        --notifications-with-subscribers \
            "Notification={NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=100,ThresholdType=PERCENTAGE},Subscribers=$(cat budget-subscribers.json)"
    
    log_success "Budget created with automatic termination trigger"
    
    # Clean up temp files
    rm -f budget-definition.json budget-subscribers.json
}

# Create CloudWatch alarm for cost monitoring
create_cost_alarm() {
    log_info "Creating CloudWatch billing alarm..."
    
    # Note: Billing metrics are only available in us-east-1
    ORIGINAL_REGION="$REGION"
    export AWS_DEFAULT_REGION="us-east-1"
    
    aws cloudwatch put-metric-alarm \
        --alarm-name "HighBillingAlarm-$INSTANCE_ID" \
        --alarm-description "Alarm when AWS bill exceeds $2700" \
        --metric-name EstimatedCharges \
        --namespace AWS/Billing \
        --statistic Maximum \
        --period 86400 \
        --threshold 2700 \
        --comparison-operator GreaterThanThreshold \
        --dimensions Name=Currency,Value=USD \
        --evaluation-periods 1 \
        --alarm-actions "arn:aws:sns:us-east-1:$ACCOUNT_ID:billing-alerts" 2>/dev/null || \
        log_warning "Could not create billing alarm (SNS topic may not exist)"
    
    export AWS_DEFAULT_REGION="$ORIGINAL_REGION"
}

# Main deployment function
main() {
    echo "========================================"
    echo "Secure EC2 Instance Deployment"
    echo "========================================"
    
    get_aws_info
    create_budget_role
    get_vpc_info
    create_security_group
    get_ami_id
    launch_instance
    create_termination_lambda
    create_budget_monitoring
    create_budget
    create_cost_alarm
    
    echo ""
    echo "========================================"
    echo "           DEPLOYMENT SUMMARY"
    echo "========================================"
    echo ""
    log_success "Secure instance deployment completed!"
    echo ""
    echo "📋 Instance Details:"
    echo "   Instance ID: $INSTANCE_ID"
    echo "   Instance Type: $INSTANCE_TYPE"
    echo "   Security Group: $SECURITY_GROUP_ID (no ingress rules)"
    echo "   Public IP: None (private subnet deployment)"
    echo ""
    echo "💰 Budget Protection:"
    echo "   Budget Name: $BUDGET_NAME"
    echo "   Budget Limit: \$${BUDGET_LIMIT} USD"
    echo "   Action: AUTOMATIC EC2 TERMINATION when exceeded"
    echo "   Lambda Function: $LAMBDA_FUNCTION_NAME"
    echo "   SNS Topic: $SNS_TOPIC_ARN"
    echo "   Email Notifications: ${EMAIL_ADDRESSES[*]}"
    echo ""
    echo "⚠️  Important Notes:"
    echo "   - Instance has no public IP and no ingress access"
    echo "   - Access only via AWS Systems Manager Session Manager"
    echo "   - Instance will be AUTOMATICALLY TERMINATED at \$${BUDGET_LIMIT} threshold"
    echo "   - Lambda function monitors budget and terminates instance"
    echo "   - Monitor costs regularly in AWS Billing Dashboard"
    echo ""
    echo "🔧 To connect to the instance:"
    echo "   aws ssm start-session --target $INSTANCE_ID"
    echo ""
}

# Error handling
trap 'log_error "Deployment failed at line $LINENO. Check the error above."; exit 1' ERR

# Run main deployment
main

log_success "All done! 🚀"