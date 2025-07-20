import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";

export const lambdaArchitecture = Architecture.ARM_64;
export const lambdaRuntime = Runtime.PYTHON_3_12;
export const lambdaBundlerImage = lambdaRuntime.bundlingImage