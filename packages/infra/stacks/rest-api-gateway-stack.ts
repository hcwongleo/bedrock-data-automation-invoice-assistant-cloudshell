import { CfnOutput, CfnResource, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { lambdaBundlerImage, lambdaRuntime } from "../config/AppConfig";
import { AuthorizationType, CfnAuthorizer, Cors, LambdaIntegration, MethodLoggingLevel, RestApi } from "aws-cdk-lib/aws-apigateway";
import { CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import * as path from "path";
import { NagSuppressions } from "cdk-nag";
import { Vpc, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";

interface RestApiGatewayStackProps extends StackProps {
    userPoolARN: string
    distributionDomainName: string;
    regionalWebAclArn: string;
    vpc: Vpc;
    defaultSecurityGroup: SecurityGroup;
    supplierMatcherFunction: Function;
}

export class RestApiGatewayStack extends Stack {
    constructor(scope: Construct, id: string, props: RestApiGatewayStackProps) {
        super(scope, id, props);

        const stageName = "dev";

        const restAPI = new RestApi(this, `rest-api`, {
            restApiName: `rest-api`,
            cloudWatchRole: true,
            cloudWatchRoleRemovalPolicy: RemovalPolicy.DESTROY, // to avoid stack re-deployment failures
            deployOptions: {
                stageName,
                metricsEnabled: true,
                loggingLevel: MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
            },
            defaultCorsPreflightOptions: {
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                    'X-Amz-User-Agent',
                    'X-Requested-With'
                ],
                allowMethods: [
                    CorsHttpMethod.OPTIONS,
                    CorsHttpMethod.GET,
                    CorsHttpMethod.POST,
                    CorsHttpMethod.PUT,
                    CorsHttpMethod.DELETE,
                    CorsHttpMethod.PATCH
                ],
                allowCredentials: true,
                // Updated CORS origins to include CloudFront domain and localhost for development
                allowOrigins: [
                    "http://localhost:3000", 
                    "http://localhost:5173", // Vite default port
                    `https://${props.distributionDomainName}`
                ],
                // Add max age for preflight caching
                maxAge: Duration.seconds(86400), // 24 hours
            },
        })

        const cfnAuthorizer = new CfnAuthorizer(this, `authorizer`, {
            restApiId: restAPI.restApiId,
            type: 'COGNITO_USER_POOLS',
            name: stageName + '_cognitoauthorizer',
            providerArns: [props.userPoolARN], // userPoolArn is userPool.arn value
            identitySource: 'method.request.header.Authorization',
        });


        // Supplier matching endpoint
        const supplierMatchResource = restAPI.root.addResource("supplier-match");
        var supplierMatchEndpoint = supplierMatchResource.addMethod('POST', new LambdaIntegration(props.supplierMatcherFunction, {
            proxy: true,
        }));

        // Configure authorization for the supplier matching endpoint
        const resourceSupplierMatchEndpoint = supplierMatchEndpoint.node.findChild('Resource');
        (resourceSupplierMatchEndpoint as CfnResource).addPropertyOverride('AuthorizationType', AuthorizationType.COGNITO);
        (resourceSupplierMatchEndpoint as CfnResource).addPropertyOverride('AuthorizerId', { Ref: cfnAuthorizer.logicalId });

        new CfnWebACLAssociation(this, `webacl-rest-api-association`, {
            resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${restAPI.restApiId}/stages/${restAPI.deploymentStage.stageName}`,
            webAclArn: props.regionalWebAclArn,
        });


        NagSuppressions.addResourceSuppressions(
            props.supplierMatcherFunction,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Using default role for demo purposes. This lambda must use a specific role tailored to its function",
                },
                {
                    id: "AwsSolutions-L1",
                    reason: "Deliberately setting to use latest version -1 to ensure compatibility for demos.",
                },
            ])

        NagSuppressions.addResourceSuppressions(
            restAPI,
            [
                {
                    id: "AwsSolutions-APIG1",
                    reason: "access logging enabled - work in progress",
                },
                {
                    id: "AwsSolutions-APIG2",
                    reason: "request validation - work in progress",
                },
                {
                    id: "AwsSolutions-APIG4",
                    reason: "auth integration - work in progress",
                },
                {
                    id: "AwsSolutions-COG4",
                    reason: "auth integration - work in progress",
                },

            ],
            true
        );


        new CfnOutput(this, "config-apigateway-rest-api-url-output", {
            value: restAPI.url,
            description: "api http endpoint",
            exportName: `config-apigateway-rest-api-url-output`,
        });

    }
}