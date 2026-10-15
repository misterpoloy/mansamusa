#!/usr/bin/env bash
# Build the AgentCore runtime image (linux/arm64), push it to ECR and roll the runtime (tracker P7.06).
# Usage: scripts/push-runtime.sh [tag]     (requires: docker buildx, aws cli, terraform outputs)
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-$(git rev-parse --short HEAD)}"
REGION="${AWS_REGION:-us-east-1}"
REPO_URL="$(terraform -chdir=infra output -raw runtime_repository_url)"
REGISTRY="${REPO_URL%%/*}"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker buildx build --platform linux/arm64 -f packages/runtime/Dockerfile -t "$REPO_URL:$TAG" --push .
terraform -chdir=infra apply -var "runtime_image_tag=$TAG"
