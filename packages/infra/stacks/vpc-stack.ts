import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

import { FlowLogTrafficType, GatewayVpcEndpointAwsService, IpAddresses, Peer, Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";

export class VpcStack extends Stack {
    public vpc: Vpc;
    public defaultSecurityGroup: SecurityGroup;


    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);


        // create a vpc 
        this.vpc = new Vpc(this, `vpc`, {
            ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
            natGateways: 1,
            maxAzs: 3,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            flowLogs: {
                logs: {
                    trafficType: FlowLogTrafficType.REJECT,
                },
            },
            subnetConfiguration: [
                {
                    name: `public-subnet`,
                    subnetType: SubnetType.PUBLIC,
                    cidrMask: 24,
                },
                {
                    name: `private-isolated`,
                    subnetType: SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 28,
                },
                {
                    name: `private-with-egress`,
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
            ],
            gatewayEndpoints: {
                S3: {
                    service: GatewayVpcEndpointAwsService.S3,
                },
                DynamoDB: {
                    service: GatewayVpcEndpointAwsService.DYNAMODB,
                },

            },
        });

        // create a security group 
        this.defaultSecurityGroup = new SecurityGroup(this, `default-sg`, {
            vpc: this.vpc,
            allowAllOutbound: true,
        });

        // create an ingress rule for Security group
        this.defaultSecurityGroup.addIngressRule(
            Peer.ipv4(this.vpc.vpcCidrBlock),
            Port.tcp(443),
            "Allow access from client"
        )


    }
}