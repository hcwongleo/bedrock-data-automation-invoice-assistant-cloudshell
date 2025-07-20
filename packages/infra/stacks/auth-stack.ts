import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from 'constructs';

import { AccountRecovery, CfnIdentityPool, CfnIdentityPoolRoleAttachment, CfnUserPoolGroup, ClientAttributes, FeaturePlan, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Role, FederatedPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { NagSuppressions } from "cdk-nag";
import { Key } from "aws-cdk-lib/aws-kms";


interface AuthStackProps extends StackProps {
    regionalWebAclArn: string;
    distributionDomainName: string;
    kmsKey: Key;
}

export class AuthStack extends Stack {
    public readonly userPool: UserPool;
    public readonly userPoolClient: UserPoolClient;
    public readonly identityPool: CfnIdentityPool;
    public readonly authenticatedRole: Role;
    public readonly unauthenticatedRole: Role;
    public readonly identityPoolRoleAttachment: CfnIdentityPoolRoleAttachment;

    private oidcProvider: cdk.aws_cognito.CfnUserPoolIdentityProvider
    private userPoolDomain: cdk.aws_cognito.CfnUserPoolDomain

    constructor(scope: Construct, id: string, props: AuthStackProps) {
        super(scope, id, props);

        this.userPool = new UserPool(this, `user-pool`, {
            userPoolName: `user-pool`,
            selfSignUpEnabled: false, // avoid new users from signing up via webapp ui
            signInAliases: {
                phone: false,
                email: false
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireDigits: true,
                requireUppercase: true,
                requireSymbols: true,
            },
            accountRecovery: AccountRecovery.EMAIL_ONLY,

            removalPolicy: RemovalPolicy.DESTROY, // since its midway authed users we do not want to retain this user-pool upo stack deletion/updates
            featurePlan: FeaturePlan.ESSENTIALS, // https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html
            // set up custom attributes only if midway auth is selected 

        });

        NagSuppressions.addResourceSuppressions(
            this.userPool,
            [
                {
                    id: "AwsSolutions-COG3",
                    reason: "AdvancedSecurityMode is set to depreciate. Using Cognito Feature Plans to subscribe for Essential security feature.",
                },
            ])

        // create Admin group
        new CfnUserPoolGroup(this, `admin-group`, {
            userPoolId: this.userPool.userPoolId,
            groupName: "Admin",
            description: "Admin Group",
        });
        // create Users group
        new CfnUserPoolGroup(this, `user-group`, {
            userPoolId: this.userPool.userPoolId,
            groupName: "Users",
            description: "Users Group",
        });


        // User Pool Client
        const callbackUrls = [`https://${props.distributionDomainName}`, "http://localhost:3000"];

        this.userPoolClient = new UserPoolClient(this, `user-pool-client`, {
            userPool: this.userPool,
            userPoolClientName: `client`,
            generateSecret: false,
            refreshTokenValidity: Duration.minutes(60),
            accessTokenValidity: cdk.Duration.minutes(60),
            idTokenValidity: cdk.Duration.minutes(60),
            readAttributes: new ClientAttributes().withStandardAttributes({
                email: true,
            }),
        });

        // identity pool
        this.identityPool = new CfnIdentityPool(this, `identity-pool`, {
            identityPoolName: `identity-pool`,
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: this.userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
                },
            ],
        });


        // Role associated with authenticated users
        this.authenticatedRole = new Role(this, `AuthenticatedRole`, {
            assumedBy: new FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                {
                    StringEquals: {
                        "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "authenticated",
                    },
                },
                "sts:AssumeRoleWithWebIdentity"
            ),
        });

        // Add KMS permissions to the authenticated role
        this.authenticatedRole.addToPolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    "kms:Decrypt",
                    "kms:GenerateDataKey",
                    "kms:DescribeKey"
                ],
                resources: [props.kmsKey.keyArn],
            })
        );


        // Role associated with unauthenticated users
        this.unauthenticatedRole = new Role(this, `UnauthenticatedRole`, {
            assumedBy: new FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                {
                    StringEquals: {
                        "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "unauthenticated",
                    },
                },
                "sts:AssumeRoleWithWebIdentity"
            ),
        });



        // explicitly deny all access for unauth role 
        this.unauthenticatedRole.addToPolicy(
            new PolicyStatement({
                effect: Effect.DENY,
                actions: ["*"],
                resources: ["*"],
            })
        );

        // Attach the unauthenticated and authenticated roles to the identity pool
        this.identityPoolRoleAttachment = new CfnIdentityPoolRoleAttachment(
            this,
            `RoleAttachment`,
            {
                identityPoolId: this.identityPool.ref,
                roles: {
                    authenticated: this.authenticatedRole.roleArn,
                    unauthenticated: this.unauthenticatedRole.roleArn,
                },
            }
        );

        // associate the regional WAF to AWS Cognito 
        new CfnWebACLAssociation(this, `webacl-cognito-association`, {
            resourceArn: this.userPool.userPoolArn,
            webAclArn: props.regionalWebAclArn,
        });


        // Cognito resource  Outputs
        new cdk.CfnOutput(this, 'config-cognito-identitypool-id', {
            value: this.identityPool.ref,
            description: "identity pool id",
            exportName: `config-cognito-identitypool-id`,
        });

        new cdk.CfnOutput(this, "config-cognito-userpool-id", {
            value: this.userPool.userPoolId,
            description: "user pool id",
            exportName: `config-cognito-userpool-id`,
        });

        new cdk.CfnOutput(this, "config-cognito-appclient-id", {
            value: this.userPoolClient.userPoolClientId,
            description: "app client id",
            exportName: `config-cognito-appclient-id`,
        });

        new cdk.CfnOutput(this, "config-cognito-callback-url", {
            value: callbackUrls[0],
            description: "callback url",
            exportName: `config-cognito-callback-url`,
        });

        new cdk.CfnOutput(this, "config-cognito-logout-url-output", {
            value: callbackUrls[0],
            description: "logout url",
            exportName: `config-cognito-logout-url`,
        });
    }
}