import boto3
import cfnresponse
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bda = boto3.client('bedrock-data-automation')

def handler(event, context):
    response_data = {}
    try:
        logger.info('Received event: %s', event)
        request_type = event['RequestType']
        properties = event['ResourceProperties']

        if request_type == 'Create':
            response_data = handle_create(properties)
        elif request_type == 'Update':
            response_data = handle_update(properties)
        elif request_type == 'Delete':
            handle_delete(properties)

        cfnresponse.send(event, context, cfnresponse.SUCCESS, response_data)
    except Exception as e:
        logger.error('Error: %s', str(e))
        cfnresponse.send(event, context, cfnresponse.FAILED, {})
    return {
            'PhysicalResourceId': event['LogicalResourceId'],
            'Data': response_data
        }

def get_project_arn(project_name):
    try:
        projects = bda.list_data_automation_projects()['projects']
        for project in projects:
            if project['projectName'] == project_name:
                return project['projectArn']
        return None
    except Exception as e:
        logger.error(f'Error getting project ARN: {str(e)}')
        return None

def handle_create(properties):
    # Implement your Bedrock data automation creation logic here
    required_params = {
        'projectName': properties.get('projectName'),
        'standardOutputConfiguration': properties.get('standardOutputConfiguration')
    }
    optional_params = {
        'projectDescription': properties.get('projectDescription'),
        'projectStage': properties.get('projectStage'),
        'customOutputConfiguration': properties.get('customOutputConfiguration'),
        'overrideConfiguration': properties.get('overrideConfiguration'),
        'clientToken': properties.get('clientToken'),
        'encryptionConfiguration': properties.get('encryptionConfiguration')
    }
    
    params = {**required_params, **{k: v for k, v in optional_params.items() if v is not None}}

    response = bda.create_data_automation_project(
        **params
    )
    logger.info('Created project: %s', response)
    
    # Wait for project to be ready
    project_arn = response['projectArn']
    while True:
        try:
            project_status = bda.get_data_automation_project(projectArn=project_arn)['project']['status']
            logger.info('Project status: %s', project_status)
            if project_status == 'COMPLETED':
                break
            elif project_status == 'FAILED':
                raise Exception(f'Project creation failed with status: {project_status}')
        except Exception as e:
            logger.error(f'Error checking project status: {str(e)}')
            break
    
    logger.info('Project created successfully!')
    return {
        'ProjectArn': response['projectArn']
    }

def handle_update(properties):
    # Implement your update logic here
    project_arn = get_project_arn(properties.get('projectName'))
    if not project_arn:
        raise Exception(f"Project {properties.get('projectName')} not found")
        
    required_params = {
        'projectArn': project_arn,
        'standardOutputConfiguration': properties.get('standardOutputConfiguration')
    }
    optional_params = {
        'projectDescription': properties.get('projectDescription'),
        'projectStage': properties.get('projectStage'),
        'customOutputConfiguration': properties.get('customOutputConfiguration'),
        'overrideConfiguration': properties.get('overrideConfiguration')
    }
    
    params = {**required_params, **{k: v for k, v in optional_params.items() if v is not None}}

    response = bda.update_data_automation_project(
        **params
    )

    logger.info('Updated project: %s', response)
    return {
        'ProjectArn': response['projectArn']
    }

def handle_delete(properties):
    # Implement your cleanup logic here
    project_arn = get_project_arn(properties.get('projectName'))
    if not project_arn:
        logger.info('Project not found, considering delete successful')
        return

    try:
        bda.delete_data_automation_project(
            projectArn=project_arn
        )
        logger.info('Project deleted successfully')
    except bda.exceptions.ResourceNotFoundException:
        logger.info('Data source already deleted')
    except Exception as e:
        logger.error(f'Error deleting project: {str(e)}')
        # Don't fail the delete operation
