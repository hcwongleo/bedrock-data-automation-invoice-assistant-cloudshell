import os
import boto3
import cfnresponse
import logging
import json
import time
from botocore.config import Config

TARGET_BUCKET_NAME = os.environ.get('TARGET_BUCKET_NAME', None)
# Use the environment variable for the project ARN
DATA_PROJECT_ARN = os.environ.get('DATA_PROJECT_ARN', None)
ACCOUNT_ID = os.environ.get('ACCOUNT_ID', None)
CUSTOM_BLUEPRINT_ARN = os.environ.get('CUSTOM_BLUEPRINT_ARN', None)

config = Config(
    retries = dict(
        max_attempts = 3,
        mode = 'standard' 
    )
)

s3 = boto3.client("s3")
bda = boto3.client("bedrock-data-automation-runtime", config=config)


def invoke_insight_generation_async(
        input_s3_uri,
        output_s3_uri,
        custom_blueprint_arn):

    payload = {
        "inputConfiguration": {
            "s3Uri": input_s3_uri
        },
        "outputConfiguration": {
            "s3Uri": output_s3_uri
        },
        "blueprints": [
            {
                "blueprintArn": custom_blueprint_arn,
                "stage": "LIVE"
            }
        ],
        "dataAutomationProfileArn": f"arn:aws:bedrock:us-east-1:{str(ACCOUNT_ID)}:data-automation-profile/us.data-automation-v1",
        "notificationConfiguration": {
        "eventBridgeConfiguration": {"eventBridgeEnabled": True},
        }
    }
    print(payload)

    response = bda.invoke_data_automation_async(**payload)
    invocation_arn = response['invocationArn']
    while bda.get_data_automation_status(invocationArn=invocation_arn)['status'] != 'Success': 
        print('Project status: %s', bda.get_data_automation_status(invocationArn=invocation_arn)['status'])
        if bda.get_data_automation_status(invocationArn=invocation_arn)['status'] in ['ServiceError', 'ClientError']:
                print(f"Job failed with status: {status}")
                print(f"Error type: {response.get('errorType')}")
                print(f"Error message: {response.get('errorMessage')}")
                return False
        # Intentional 5-second delay between API calls to prevent rate limiting
        # nosemgrep: arbitrary-sleep
        time.sleep(5)
        pass

    print(response)
    return response


def process_bda_output(output_s3_uri_raw, targetkey):
    # Parse the S3 URI
    bucket_name = output_s3_uri_raw.split('//')[1].split('/')[0]
    prefix = '/'.join(output_s3_uri_raw.split('//')[1].split('/')[1:])
    print(output_s3_uri_raw, targetkey)
    print(bucket_name, prefix)
    aggregated_results = []

    try:
        # List all objects in the custom_output directory
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=f"{prefix}/")

        for obj in response.get('Contents', []):
            if 'custom_output' in obj['Key'] and obj['Key'].endswith('result.json'):
                # Read the content of each result.json file
                file_content = s3.get_object(Bucket=bucket_name, Key=obj['Key'])['Body'].read().decode('utf-8')
                json_content = json.loads(file_content)

                # Extract required fields
                extracted_data = {
                    "matched_blueprint": json_content.get("matched_blueprint"),
                    "document_class": json_content.get("document_class"),
                    "inference_result": json_content.get("inference_result")
                }

                aggregated_results.append(extracted_data)

        if not aggregated_results:
            print("No results found to process")
            return None

        # Take the first result and convert it to JSON string
        final_result = json.dumps(aggregated_results[0], indent=2)

        # Write the final result to S3
        s3.put_object(
            Bucket=bucket_name,
            Key=targetkey,
            Body=final_result,
            ContentType='application/json'
        )

        print(f"Aggregated result written to s3://{bucket_name}/{targetkey}")
        return f"s3://{bucket_name}/{targetkey}"

    except Exception as e:
        print(f"Error processing BDA output: {str(e)}")
        return None


def lambda_handler(event, context):
    print(f"Received event: {event}")

    bucket = event['detail']['bucket']['name']
    key = event['detail']['object']['key']

    targetkey_raw = key.replace("datasets/documents", "bda-result-raw")
    targetkey_processed = f"{key.replace("datasets/documents", "bda-result").split('.')[0].replace("_","-")}-result.json"

    input_s3_uri = f"s3://{bucket}/{key}"
    output_s3_uri_raw = f"s3://{TARGET_BUCKET_NAME}/{targetkey_raw.split('.')[0]}"

    print(f"input_s3_uri: {input_s3_uri}")
    print(f"output_s3_uri: {output_s3_uri_raw}")

    # Use custom blueprint directly instead of project
    if not CUSTOM_BLUEPRINT_ARN:
        print("ERROR: CUSTOM_BLUEPRINT_ARN not found in environment variables")
        return {"error": "Custom blueprint ARN not configured"}
    
    print(f"Using custom blueprint directly: {CUSTOM_BLUEPRINT_ARN}")

    # invoke insight generation
    response = invoke_insight_generation_async(input_s3_uri, output_s3_uri_raw, CUSTOM_BLUEPRINT_ARN)
    response_processed = process_bda_output(output_s3_uri_raw, targetkey_processed)

    if response_processed:
        print(f"Processed output available at: {response_processed}")
    else:
        print("Failed to process BDA output")
        
    return response