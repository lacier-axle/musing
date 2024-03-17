import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MusingCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define the VPC
    const vpc = new cdk.aws_ec2.Vpc(this, 'MyVPC', {
      maxAzs: 3, // Default is all AZs in the region
      natGateways: 1
    });

    // Create an EKS cluster
    const cluster = new cdk.aws_eks.Cluster(this, 'MyCluster', {
      version: cdk.aws_eks.KubernetesVersion.V1_29,
      vpc: vpc,
      defaultCapacity: 2, // Default is 2 m5.large instances
    });

    // Output the cluster name and kubeconfig command
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'KubeConfigCommand', {
      value: `aws eks update-kubeconfig --name ${cluster.clusterName}`,
    });
  }
}
