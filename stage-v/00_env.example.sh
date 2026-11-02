#!/usr/bin/env bash
# Save as ~/seoul-bike-pulse/.bikepulse-v.env, fill in ROOT_DOMAIN only.
# Source the existing .bikepulse-u.env first in the same shell.
export AWS_PROFILE=bikepulse-dev
export AWS_REGION=ap-northeast-2
export AWS_DEFAULT_REGION=ap-northeast-2
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export ECS_CLUSTER=bikepulse-dev-ecs
export API_SERVICE=bikepulse-dev-api-service
export FRONTEND_SERVICE=bikepulse-dev-frontend-service
export ROOT_DOMAIN=REPLACE_WITH_OWN_REGISTERED_DOMAIN
export APP_DOMAIN="bike.${ROOT_DOMAIN}"
export APP_URL="https://${APP_DOMAIN}"
export COGNITO_POOL_NAME=bikepulse-dev-users
export COGNITO_CLIENT_NAME=bikepulse-dev-alb-client
export COGNITO_DOMAIN_PREFIX="bikepulse-dev-${AWS_ACCOUNT_ID}"
export BIKEPULSE_AF_UI_ENABLED=true
export BIKEPULSE_AF_ADMIN_ACTIONS=false
# Do NOT set true until HTTPS ALB authenticate-cognito is ready.
export AUTH_MODE=staging
export BIKEPULSE_AF_ALLOW_STAGING_READONLY=true
# Fill Cognito user's true UUID after creation:
export BIKEPULSE_AF_ADMIN_SUBS=REPLACE_WITH_COGNITO_SUB
