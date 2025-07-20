import boto3
import cfnresponse
import logging
import traceback
import json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bda = boto3.client('bedrock-data-automation')


def get_blueprint_arn(blueprint_name):
    try:
        paginator = bda.get_paginator('list_blueprints')
        for page in paginator.paginate():
            for blueprint in page['blueprints']:
                if blueprint['blueprintName'] == blueprint_name:
                    return blueprint['blueprintArn']
        return None
    except Exception as e:
        logger.error(f'Error getting blueprint ARN: {str(e)}')
        return None
        

def handler(event, context):
    response_data = {}
    try:
        logger.info('Received event: %s', event)
        request_type = event['RequestType']
        properties = event['ResourceProperties']

        # Validate required properties
        if request_type == 'Create':
            required_props = ['blueprintName', 'type', 'schema']
            for prop in required_props:
                if prop not in properties:
                    raise ValueError(f"Missing required property: {prop}")
            
            # Log the schema for debugging
            logger.info(f"Schema being used: {json.dumps(properties.get('schema'), indent=2)}")

        response_data = handle_request(request_type, properties)
        logger.info('Response data: %s', response_data)
        cfnresponse.send(event, context, cfnresponse.SUCCESS, response_data)
    except Exception as e:
        error_msg = {
            'error': str(e),
            'traceback': traceback.format_exc(),
            'request_type': event.get('RequestType'),
            'properties': event.get('ResourceProperties', {})
        }
        logger.error(f"Operation failed: {json.dumps(error_msg, indent=2)}")
        cfnresponse.send(event, context, cfnresponse.FAILED, {
            'error': str(e),
            'details': error_msg
        })
    return {
        'PhysicalResourceId': event['LogicalResourceId'],
        'Data': response_data
    }


def handle_request(request_type, properties):
    try:
        if request_type == 'Create':
            return handle_create(properties)
        elif request_type == 'Update':
            return handle_update(properties)
        elif request_type == 'Delete':
            return handle_delete(properties)
    except bda.exceptions.ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise
    except bda.exceptions.ServiceQuotaExceededException as e:
        logger.error(f"Service quota exceeded: {str(e)}")
        raise
    except bda.exceptions.ConflictException as e:
        logger.error(f"Resource conflict: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise


def handle_create(properties):
    try:
        blueprint_name = properties.get('blueprintName')
        existing_blueprint_arn = get_blueprint_arn(blueprint_name)
        
        if existing_blueprint_arn:
            logger.info(f"Blueprint {blueprint_name} already exists. Returning existing blueprint information.")
            try:
                existing_blueprint = bda.get_blueprint(blueprintArn=existing_blueprint_arn)['blueprint']
                return {
                    'BlueprintArn': existing_blueprint_arn,
                    'Status': existing_blueprint.get('status'),
                    'CreationTime': str(existing_blueprint.get('creationTime')),
                    'Message': 'Existing blueprint returned'
                }
            except Exception as e:
                logger.warning(f"Could not get existing blueprint details: {str(e)}")
                return {
                    'BlueprintArn': existing_blueprint_arn,
                    'Message': 'Existing blueprint returned (details unavailable)'
                }

        required_params = {
            'blueprintName': blueprint_name,
            'type': properties.get('type'),
            'schema': properties.get('schema')
        }
        optional_params = {
            'blueprintStage': properties.get('blueprintStage'),
            'clientToken': properties.get('clientToken'),
            'encryptionConfiguration': properties.get('encryptionConfiguration')
        }
        
        params = {**required_params, **{k: v for k, v in optional_params.items() if v is not None}}
        
        logger.info(f"Creating blueprint with parameters: {json.dumps(params, indent=2)}")

        response = bda.create_blueprint(**params)

        response_log = {
            'blueprint': {
                'blueprintArn': response['blueprint']['blueprintArn'],
                'status': response['blueprint'].get('status'),
                'creationTime': str(response['blueprint'].get('creationTime')) if response['blueprint'].get('creationTime') else None,
            }
        }
        logger.info(f"Created blueprint: {json.dumps(response_log, indent=2)}")

        return {
            'BlueprintArn': response['blueprint']['blueprintArn'],
            'Status': response['blueprint'].get('status'),
            'CreationTime': str(response['blueprint'].get('creationTime')),
            'Message': 'New blueprint created'
        }

    except bda.exceptions.ValidationException as e:
        logger.error(f"Blueprint creation validation error: {str(e)}")
        raise
    except bda.exceptions.ConflictException as e:
        logger.error(f"Blueprint name conflict: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Blueprint creation failed: {str(e)}")
        raise



def handle_update(properties):
    try:
        blueprint_name = properties.get('blueprintName')
        blueprint_arn = get_blueprint_arn(blueprint_name)
        
        if not blueprint_arn:
            raise ValueError(f"Could not find blueprint with name: {blueprint_name}")

        required_params = {
            'blueprintArn': blueprint_arn,
            'schema': properties.get('schema')
        }
        optional_params = {
            'blueprintStage': properties.get('blueprintStage')
        }
        
        params = {**required_params, **{k: v for k, v in optional_params.items() if v is not None}}
        
        # Log update parameters
        logger.info(f"Updating blueprint with parameters: {json.dumps(params, indent=2)}")

        response = bda.update_blueprint(**params)
        logger.info(f"Updated blueprint: {json.dumps(response, indent=2)}")
        
        return {
            'BlueprintArn': response['blueprint']['blueprintArn'],
            'Status': response['blueprint'].get('status'),
            'LastModifiedTime': str(response['blueprint'].get('lastModifiedTime'))
        }
    except Exception as e:
        logger.error(f"Blueprint update failed: {str(e)}")
        raise


def handle_delete(properties):
    try:
        blueprint_name = properties.get('blueprintName')
        blueprint_arn = get_blueprint_arn(blueprint_name)
        
        if not blueprint_arn:
            logger.info(f"Blueprint {blueprint_name} not found, considering delete successful")
            return {}

        params = {
            'blueprintArn': blueprint_arn
        }
        if properties.get('blueprintVersion'):
            params['blueprintVersion'] = properties.get('blueprintVersion')
        
        logger.info(f"Deleting blueprint with parameters: {json.dumps(params, indent=2)}")
        
        bda.delete_blueprint(**params)
        return {'Status': 'Deleted'}
    except bda.exceptions.ResourceNotFoundException:
        logger.info(f"Blueprint {blueprint_name} already deleted")
        return {'Status': 'AlreadyDeleted'}
    except Exception as e:
        logger.error(f"Blueprint deletion failed: {str(e)}")
        # Don't fail the delete operation
        return {'Status': 'DeleteFailed', 'Error': str(e)}
