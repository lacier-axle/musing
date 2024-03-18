aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $MUSING_AWS_ACCOUNT_ID.dkr.ecr.$MUSING_AWS_REGION.amazonaws.com
docker build -t $MUSING_ECR .
docker tag $MUSING_ECR:latest $MUSING_AWS_ACCOUNT_ID.dkr.ecr.$MUSING_AWS_REGION.amazonaws.com/$MUSING_ECR:latest
docker push $MUSING_AWS_ACCOUNT_ID.dkr.ecr.$MUSING_AWS_REGION.amazonaws.com/$MUSING_ECR:latest
