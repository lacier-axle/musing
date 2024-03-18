import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { KubectlLayer } from 'aws-cdk-lib/lambda-layer-kubectl';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MusingCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

        // Create an ECR repository for the Next.js Docker image
        const nextJsAppRepo = new cdk.aws_ecr.Repository(this, 'musing-nextjs');

        // Create a VPC for the EKS cluster
        const vpc = new cdk.aws_ec2.Vpc(this, 'musing-vpc', {
          maxAzs: 3 // Default is all AZs in the region
        });
    
        // Create an EKS cluster
        const cluster = new cdk.aws_eks.Cluster(this, 'musing-cluster', {
          version: cdk.aws_eks.KubernetesVersion.V1_29,
          vpc: vpc,
          defaultCapacity: 2, // Default is 2 m5.large instances
          kubectlLayer: new KubectlLayer(this, 'MusingKubectlLayer'),
        });
    
        // Define the Kubernetes deployment for the Next.js app
        const appLabel = { app: "musing-app" };
        const deployment = {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { name: "musing-nextjs-deployment" },
          spec: {
            replicas: 2,
            selector: { matchLabels: appLabel },
            template: {
              metadata: { labels: appLabel },
              spec: {
                containers: [{
                  name: "musing-nextjs",
                  image: `${nextJsAppRepo.repositoryUri}:latest`,
                  ports: [{ containerPort: 3000 }]
                }]
              }
            }
          }
        };
    
        // Define the Kubernetes service to expose the Next.js app
        const service = {
          apiVersion: "v1",
          kind: "Service",
          metadata: { name: "musing-nextjs-service" },
          spec: {
            type: "LoadBalancer",
            ports: [{ port: 80, targetPort: 3000 }],
            selector: appLabel
          }
        };
    
        // Add the deployment and service to the EKS cluster
        cluster.addManifest('MusingNextJsAppDeployment', deployment);
        cluster.addManifest('MusingNextJsAppService', service);
    
        // Output the ECR repository URI
        new cdk.CfnOutput(this, 'MusingECRRepositoryURI', {
          value: nextJsAppRepo.repositoryUri,
        });
    
        // TODO Output the Load Balancer URL
  }
}
