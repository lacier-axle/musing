import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { KubectlV29Layer} from '@aws-cdk/lambda-layer-kubectl-v29';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';

export class MusingCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const clusterName = "musing-cluster";

    // Create a VPC for the EKS cluster
    const vpc = new cdk.aws_ec2.Vpc(this, 'musing-vpc', {
      maxAzs: 3 // Default is all AZs in the region
    });

    // Create an EKS cluster
    const cluster = new cdk.aws_eks.Cluster(this, clusterName, {
      version: cdk.aws_eks.KubernetesVersion.V1_29,
      vpc: vpc,
      defaultCapacity: 1,
      defaultCapacityInstance: cdk.aws_ec2.InstanceType.of(cdk.aws_ec2.InstanceClass.T4G, cdk.aws_ec2.InstanceSize.NANO),
      kubectlLayer: new KubectlV29Layer(this, 'MusingKubectlLayer'),
    });

    const deploymentName = "musing-nextjs-deployment";

    const repoName = "musing-nextjs-repo";

    // Create an ECR repository for the Next.js Docker image
    const nextJsAppRepo = new cdk.aws_ecr.Repository(this, repoName);

    // Define the Kubernetes deployment for the Next.js app
    const appLabel = { app: "musing-app" };

    const containerName = "musing-nextjs";
    const deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: deploymentName },
      spec: {
        replicas: 2,
        selector: { matchLabels: appLabel },
        template: {
          metadata: { labels: appLabel },
          spec: {
            containers: [{
              name: containerName,
              image: `${nextJsAppRepo.repositoryUri}:latest`,
              ports: [{ containerPort: 3000 }]
            }]
          }
        }
      }
    };

    const dockerBuildAndPush = new cdk.aws_codebuild.PipelineProject(this, 'DockerBuildAndPush', {
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Required for Docker builds
        environmentVariables: {
          REPOSITORY_URI: { value: nextJsAppRepo.repositoryUri, type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT },
          DOCKER_PAT: { value: "DockerPAT", type: cdk.aws_codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
          DOCKER_USERNAME: { value: "DOCKER_USERNAME", type: cdk.aws_codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER },
        },
      },
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'cd musing-nextjs',
              'echo $DOCKER_PAT | docker login --username $DOCKER_USERNAME --password-stdin',
              'docker build -t $REPOSITORY_URI:latest .',
              'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
            ],
          },
          post_build: {
            commands: [
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $REPOSITORY_URI',
              'docker push $REPOSITORY_URI:latest',
              'docker push $REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
            ],
          },
        },
      }),
    });
    nextJsAppRepo.grantPullPush(dockerBuildAndPush.grantPrincipal);

    const kubeActivateProject = new cdk.aws_codebuild.PipelineProject(this, 'KubeActivateProject', {
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Required for Docker builds
        environmentVariables: {
          REPOSITORY_URI: { value: nextJsAppRepo.repositoryUri, type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT }
        },
      },
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `aws eks --region $AWS_DEFAULT_REGION update-kubeconfig --name ${cluster.clusterName}`,
              `kubectl set image deployment/${deploymentName} ${containerName}=$REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION`,
            ],
          },
        },
      }),
    });
    nextJsAppRepo.grantPull(kubeActivateProject.grantPrincipal);
    kubeActivateProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['eks:*'],
      resources: [cluster.clusterArn],
    }));
    cluster.awsAuth.addMastersRole(kubeActivateProject.role!);

    const sourceOutput = new cdk.aws_codepipeline.Artifact();
    const sourceAction = new cdk.aws_codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub',
      output: sourceOutput,
      oauthToken: cdk.SecretValue.secretsManager('GITHUB_TOKEN'),
      owner: 'lacier-axle',
      repo: 'musing',
      branch: 'main',
    });

    const musingCodePipeline = new cdk.aws_codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'MusingNextJsDeployment',
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'BuildAndPush',
          actions: [
              new cdk.aws_codepipeline_actions.CodeBuildAction({
              actionName: 'BuildAndPush',
              project: dockerBuildAndPush,
              input: sourceOutput,
            })
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new cdk.aws_codepipeline_actions.CodeBuildAction({
              actionName: 'Deploy',
              project: kubeActivateProject,
              input: sourceOutput,
            })
          ],
        },
      ],
    });

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
