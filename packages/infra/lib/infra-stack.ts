import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from "cdk-nag";
import { BDAStack } from "../stacks/bda-stack";
import { VpcStack } from "../stacks/vpc-stack";
import { WAFStack } from "../stacks/waf-stack";
import { WebsiteWAFStack } from "../stacks/website-waf-stack";
import { AuthStack } from "../stacks/auth-stack";
import { BucketStack } from "../stacks/bucket-stack";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { RestApiGatewayStack } from "../stacks/rest-api-gateway-stack";
import { StackProps } from "aws-cdk-lib";


export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);


    /**
     * VPC Stack
    */
    const vpcStack = new VpcStack(this, "vpc-stack", props)

    /**
     * Web application Firewall stack 
     */
    const wafStack = new WAFStack(this, "waf-stack", props)

    /**
      * Website stack to host the static website
      * with Amazon cloudfront, AWS S3 buckets with access logs 
      */

    const websiteWafStack = new WebsiteWAFStack(this, "website-waf-stack", props);

    NagSuppressions.addStackSuppressions(websiteWafStack, [{
      id: "AwsSolutions-IAM4",
      reason: "Custom WAF resource overrides to create in us-east-1",
    },
    {
      id: "AwsSolutions-L1",
      reason: "regional WAF CDK construct is inherently using an older version. Will update the construct when a new version becomes available.",
    },])

    /**
    * Auth Stack
    */

    const authStack = new AuthStack(this, "auth-stack", {
      ...props,
      regionalWebAclArn: wafStack.regionalWebAcl.attrArn,
      distributionDomainName: websiteWafStack.cloudfrontDistribution.distributionDomainName,
      kmsKey: websiteWafStack.kmsKey
    })
    authStack.addDependency(wafStack)
    authStack.addDependency(websiteWafStack)


    /**
      * Bucket Stack 
      */
    const dataBucketStack = new BucketStack(this, "data-bucket-stack", {
      ...props,
      distributionDomainName: websiteWafStack.cloudfrontDistribution.distributionDomainName,
      projectAccessLogsBucket: websiteWafStack.projectAccessLogsBucket,
      kmsKey: websiteWafStack.kmsKey
    })
    dataBucketStack.addDependency(websiteWafStack)

    NagSuppressions.addStackSuppressions(dataBucketStack, [{
      id: "AwsSolutions-IAM4",
      reason: "Using managed policies for wider access to logging for Lambda",
    },
    {
      id: "AwsSolutions-IAM5",
      reason: "BDA has the wild cards to accommodate future BDA configurations.",
    },
    {
      id: "AwsSolutions-L1",
      reason: "Using latest supported Python runtime (3.12)",
    }])

    // allow cognito auth role to access content bucket
    authStack.authenticatedRole.addToPrincipalPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        resources: [
          dataBucketStack.dataBucket.bucketArn,
          `${dataBucketStack.dataBucket.bucketArn}/*`,
        ], //restrict R/W objects for data bucket only in the same account under the prefix of this project name
        // 
      })
    );

    /* BDA Stack */
    const bdaStack = new BDAStack(this, "bda-stack", {
      ...props,
      fileBucket: dataBucketStack.dataBucket
    })

    NagSuppressions.addStackSuppressions(bdaStack, [{
      id: "AwsSolutions-IAM4",
      reason: "Using managed policies for wider access to logging for Lambda",
    },
    {
      id: "AwsSolutions-IAM5",
      reason: "BDA has the wild cards to accommodate future BDA configurations.",
    },
    {
      id: "AwsSolutions-L1",
      reason: "Using latest supported Python runtime (3.12)",
    }])

    NagSuppressions.addStackSuppressions(authStack, [{
      id: "AwsSolutions-IAM5",
      reason: "allow wild card in data bucket access to allow access to future prefixes",
    }])

    /**
    * Rest API Gateway Stack
    */

    const restAPIGatewayStack = new RestApiGatewayStack(this, "rest-api-gateway-stack", {
      ...props,
      userPoolARN: authStack.userPool.userPoolArn,
      distributionDomainName: websiteWafStack.cloudfrontDistribution.distributionDomainName,
      regionalWebAclArn: wafStack.regionalWebAcl.attrArn,
      vpc: vpcStack.vpc,
      defaultSecurityGroup: vpcStack.defaultSecurityGroup,
      supplierMatcherFunction: bdaStack.supplierMatcherFunction
    })

    restAPIGatewayStack.addDependency(authStack)
    restAPIGatewayStack.addDependency(websiteWafStack)
    restAPIGatewayStack.addDependency(wafStack)
    restAPIGatewayStack.addDependency(bdaStack)

    NagSuppressions.addStackSuppressions(restAPIGatewayStack, [{
      id: "AwsSolutions-IAM4",
      reason: "Using default role for demo purposes. This lambda must use a specific role tailored to its function",
    }])

  }
}
