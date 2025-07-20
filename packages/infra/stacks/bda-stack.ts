import { Stack, StackProps, Aspects, Duration, aws_events_targets as targets, aws_events as events } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { DataAutomationProject, DataAutomationBlueprint } from "../constructs/bda-construct";
import { AwsSolutionsChecks } from 'cdk-nag';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import * as BDAConfig from '../config/BDAConfig';

interface BDAStackProps extends StackProps {
    fileBucket: Bucket;
}
  
export class BDAStack extends Stack {
    public readonly role: iam.Role;
    public readonly fileBucket: Bucket;
    public readonly supplierMatcherFunction: lambda.Function;

    constructor(scope: Construct, id: string, props: BDAStackProps) {
        super(scope, id, props);
        this.fileBucket = props.fileBucket; 

        Aspects.of(this).add(new AwsSolutionsChecks());

        // Create custom blueprint first
        const customBlueprint = new DataAutomationBlueprint(this, "CustomInvoiceBlueprint", {
            blueprintName: "ComprehensiveInvoiceBlueprint",
            type: "DOCUMENT",
            schema: BDAConfig.customBlueprint["ComprehensiveInvoice"],
            blueprintStage: "LIVE"
        });

        // Create BDA project with ONLY custom blueprint (no standard blueprints)
        const project = new DataAutomationProject(this, "BDA-project", {
            projectName: `InvoiceApp`,
            standardOutputConfiguration: BDAConfig.standardOutputConfiguration,
            customOutputConfiguration: {
                'blueprints': [
                    {
                        'blueprintArn': customBlueprint.blueprintARN
                    }
                ]
            }
        });

        // Ensure project depends on custom blueprint being created first
        project.node.addDependency(customBlueprint);

        if (this.fileBucket && !this.fileBucket.encryptionKey) {
            throw new Error('Bucket encryption key is required');
        }
        
        // Create EventBridge rules for specific prefixes
        const invokeDataAutomationLambdaFunction = this.createInvokeDataAutomationFunction({
            targetBucketName: this.fileBucket.bucketName,
            accountId: this.account,
            dataProjectArn: project.projectARN,
            targetBucketKey: this.fileBucket.encryptionKey!.keyArn,
            customBlueprintArn: customBlueprint.blueprintARN
        });
      
        const rule = new events.Rule(this, 'DocumentsRule', {
            eventPattern: {
                source: ['aws.s3'],
                detailType: ['Object Created'],
                detail: {
                    bucket: { name: [this.fileBucket.bucketName] },
                    object: { key: [{ prefix: 'datasets' }] },
                },
            },
        });
        rule.addTarget(new targets.LambdaFunction(invokeDataAutomationLambdaFunction));

        // Create Supplier Matcher Lambda Function
        this.supplierMatcherFunction = this.createSupplierMatcherFunction({
            targetBucketName: this.fileBucket.bucketName,
            targetBucketKey: this.fileBucket.encryptionKey!.keyArn
        });
        

    }
  
    private createInvokeDataAutomationFunction(params: {
        targetBucketName: string;
        accountId: string;
        dataProjectArn?: string;
        targetBucketKey?: string;
        customBlueprintArn?: string;
    }): lambda.Function {
  
        const layer_boto3 = new lambda.LayerVersion(this, 'LatestBoto3Layer', {
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
    
        const lendingDocumentAutomationLambdaFunction = new lambda.Function(
          this,
          'invoke_data_automation',
          {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'index.lambda_handler',
            code: new lambda.InlineCode(fs.readFileSync('lambda/python/bda-load-lambda/index_bda_call.py', { encoding: 'utf-8' })),
            timeout: Duration.seconds(300),
            layers: [layer_boto3],
            environment: {
              TARGET_BUCKET_NAME: params.targetBucketName,
              ACCOUNT_ID: this.account,
              ...(params.dataProjectArn && {
                DATA_PROJECT_ARN: params.dataProjectArn,
              }),
              ...(params.customBlueprintArn && {
                CUSTOM_BLUEPRINT_ARN: params.customBlueprintArn,
              }),
            },
          }
        );
    
        lendingDocumentAutomationLambdaFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['bedrock:List*'],
            resources: ['*'],
          })
        );
  
        lendingDocumentAutomationLambdaFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                  'bedrock:InvokeDataAutomationAsync',
                  'bedrock:GetDataAutomationStatus'
                ],
                resources: ['*'],
              })
        );
  
        lendingDocumentAutomationLambdaFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                  's3:GetObject',
                  's3:PutObject',
                  's3:ListBucket'
                ],
                resources: [
                    `arn:aws:s3:::${params.targetBucketName}/*`,
                    `arn:aws:s3:::${params.targetBucketName}`
                ],
              })
        );
  
        lendingDocumentAutomationLambdaFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    'kms:Decrypt',
                    'kms:GenerateDataKey',
                    'kms:DescribeKey'
                ],
                resources: [`${params.targetBucketKey}`],
              })
        );
    
        return lendingDocumentAutomationLambdaFunction;
    }

    private createSupplierMatcherFunction(params: {
        targetBucketName: string;
        targetBucketKey: string;
    }): lambda.Function {
        
        // Create Lambda function for supplier matching with Python dependencies
        const supplierMatcherFunction = new pythonLambda.PythonFunction(this, 'supplier-matcher', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'lambda_handler',
            entry: './lambda/supplier-matcher',
            timeout: Duration.minutes(5),
            memorySize: 512,
            environment: {
                BUCKET_NAME: params.targetBucketName
            },
            description: 'Supplier matching using thefuzz library'
        });

        // Add S3 permissions
        supplierMatcherFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    's3:GetObject',
                    's3:ListBucket'
                ],
                resources: [
                    `arn:aws:s3:::${params.targetBucketName}/*`,
                    `arn:aws:s3:::${params.targetBucketName}`
                ],
            })
        );

        // Add KMS permissions
        supplierMatcherFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    'kms:Decrypt',
                    'kms:DescribeKey'
                ],
                resources: [`${params.targetBucketKey}`],
            })
        );

        return supplierMatcherFunction;
    }
}
