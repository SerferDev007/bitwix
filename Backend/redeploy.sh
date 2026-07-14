#!/usr/bin/env bash
# ===========================================================================
#  Manual backend redeploy from AWS CloudShell (a fallback for the GitHub
#  Action .github/workflows/deploy-backend.yml). CloudShell has Docker; your
#  local machine does not, which is why this runs there.
#
#  Usage (in CloudShell):
#    git clone --filter=blob:none --sparse https://github.com/SerferDev007/bitwix.git
#    cd bitwix && git sparse-checkout set Backend && cd Backend
#    bash redeploy.sh
# ===========================================================================
set -euo pipefail

REGION=ap-south-1
ACCOUNT=214745598689
REPO=bitwix-backend
SERVICE=bitwix-backend
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
IMAGE="$REGISTRY/$REPO"

echo "==> ECR login"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> Build image (linux/amd64)"
docker build --platform linux/amd64 -t "$IMAGE:latest" .

echo "==> Push to ECR"
docker push "$IMAGE:latest"

echo "==> Trigger App Runner deployment (re-pull :latest)"
ARN=$(aws apprunner list-services --region "$REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn" --output text)
if [ -z "$ARN" ] || [ "$ARN" = "None" ]; then echo "Service '$SERVICE' not found"; exit 1; fi
OP=$(aws apprunner start-deployment --region "$REGION" --service-arn "$ARN" --query OperationId --output text)
echo "    service=$ARN"
echo "    operation=$OP"

echo "==> Waiting for deployment to finish (this is the step update-service skips)"
for i in $(seq 1 40); do
  ST=$(aws apprunner list-operations --region "$REGION" --service-arn "$ARN" \
    --query "OperationSummaryList[?Id=='$OP'].Status" --output text)
  echo "    [$i] $ST"
  case "$ST" in
    SUCCEEDED) break ;;
    FAILED|ROLLBACK_*) echo "Deployment $ST — check App Runner application logs"; exit 1 ;;
  esac
  sleep 15
done

echo "==> Invalidate CloudFront /api/* (clear cached API responses)"
aws cloudfront create-invalidation --distribution-id ERN797ECCH3LY --paths '/api/*' >/dev/null || true

echo "==> Verify"
echo -n "health : "; curl -s https://www.bitwix.co.in/api/health; echo
echo -n "team   : "; curl -s https://www.bitwix.co.in/api/team | head -c 120; echo
echo "Done. If you needed schema/seed changes, ensure RUN_DB_INIT=true was set for THIS deploy, then set it back to false."
