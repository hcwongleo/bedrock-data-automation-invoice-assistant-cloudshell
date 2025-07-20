import * as cdk from 'aws-cdk-lib';
import * as custom from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';
import { StackProps } from "aws-cdk-lib";


export interface DataAutomationBlueprintProps extends StackProps {
  // List all the properties 
  blueprintName: string;
  type: string;
  schema: string;
  blueprintStage?: string;
  clientToken?: string;
  encryptionConfiguration?: {};
}
export class DataAutomationBlueprint extends Construct {
  public readonly role: iam.Role;
  public readonly blueprintARN: string
  public readonly response: string

  constructor(scope: Construct, id: string, props: DataAutomationBlueprintProps) {
    super(scope, id);

    // Lambda function to handle Bedrock Data Automation
    this.role = new iam.Role(this, `cr_role_blueprint`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'bedrock:CreateBlueprint',
                'bedrock:UpdateBlueprint',
                'bedrock:DeleteBlueprint',
                'bedrock:ListBlueprints',
                'bedrock:GetBlueprint'
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    const layer = new lambda.LayerVersion(this, 'LatestBoto3Layer', {
      code: lambda.Code.fromAsset('.', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            `mkdir -p /asset-output/python && \
                      pip install boto3 --target /asset-output/python && \
                      cp -au /asset-output/python/* /asset-output/`
          ],
        },
      }),
      description: 'Latest boto3 layer',
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
    });

    const BDA_onEventHandler = new lambda.Function(this, `BedrockDataAutomationBlueprintHandler`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: new lambda.InlineCode(fs.readFileSync('lambda/python/bda-blueprint-cr-lambda/index_blueprint.py', { encoding: 'utf-8' })),
      timeout: cdk.Duration.minutes(15),
      layers: [layer],
      role: this.role,
      description: 'Custom Resource Provider - Bedrock Data Automation blueprint',
    });

    const provider = new custom.Provider(this, 'Provider', {
      onEventHandler: BDA_onEventHandler
    });

    const customResource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: props,
    });

    customResource.node.addDependency(BDA_onEventHandler);
    this.blueprintARN = customResource.getAttString('BlueprintArn')

  }
}

export interface DataAutomationProjectProps {
  // List all the properties 
  projectName: string;
  standardOutputConfiguration: {};
  projectDescription?: string;
  customOutputConfiguration?: {};
  projectStage?: string;
  overrideConfiguration?: {};
  clientToken?: string;
  encryptionConfiguration?: {};
}
export class DataAutomationProject extends Construct {
  public readonly role: iam.Role;
  public readonly response: string;
  public readonly projectARN: string;

  constructor(scope: Construct, id: string, props: DataAutomationProjectProps) {
    super(scope, id);

    // Lambda function to handle Bedrock Data Automation
    this.role = new iam.Role(this, `cr_role_project`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'bedrock:CreateDataAutomationProject',
                'bedrock:UpdateDataAutomationProject',
                'bedrock:DeleteDataAutomationProject',
                'bedrock:ListDataAutomationProjects',
                'bedrock:GetDataAutomationProject'
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    const layer = new lambda.LayerVersion(this, 'LatestBoto3Layer', {
      code: lambda.Code.fromAsset('.', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            `mkdir -p /asset-output/python && \
                      pip install boto3 --target /asset-output/python && \
                      cp -au /asset-output/python/* /asset-output/`
          ],
        },
      }),
      description: 'Latest boto3 layer',
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
    });

    const BDA_onEventHandler = new lambda.Function(this, `BedrockDataAutomationProjectHandler`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: new lambda.InlineCode(fs.readFileSync(path.join(__dirname, '../lambda/python/bda-project-cr-lambda/index_project.py'), { encoding: 'utf-8' })),
      timeout: cdk.Duration.minutes(15),
      layers: [layer],
      role: this.role,
      description: 'Custom Resource Provider - Bedrock Data Automation project',
    });

    const provider = new custom.Provider(this, 'Provider', {
      onEventHandler: BDA_onEventHandler
    });

    const customResource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: props,
    });

    customResource.node.addDependency(BDA_onEventHandler);
    this.projectARN = customResource.getAttString('ProjectArn')
  }
}