#!/usr/bin/env bash
set -euo pipefail
# Run from project root after source .bikepulse-v.env and 01_patch_backend_auth.py.
PROJECT="${PROJECT:-$HOME/seoul-bike-pulse}"
cd "$PROJECT"
: "${AWS_ACCOUNT_ID:?}" "${AWS_REGION:?}" "${APP_URL:?}" "${ALB_ARN:?}" "${ECR_REGISTRY:?}" "${ECS_CLUSTER:?}" "${API_SERVICE:?}"
: "${BIKEPULSE_AF_UI_ENABLED:?}" "${BIKEPULSE_AF_ADMIN_SUBS:?}"
[[ "$APP_URL" == https://* ]] || { echo 'APP_URL must be https';exit 2; }
[[ "$ALB_ARN" == arn:aws:elasticloadbalancing:*:loadbalancer/app/* ]] || { echo 'Invalid ALB ARN';exit 2; }
[[ "${BIKEPULSE_AF_ADMIN_ACTIONS:-false}" == false ]] || { echo 'Admin actions must remain disabled in stage V';exit 2; }
[[ -f backend/app/routers/af/admin_auth.py && -f backend/Dockerfile ]] || { echo 'Stage U API files missing';exit 2; }
STATE="$PROJECT/.bikepulse-v-state"
mkdir -p "$STATE"
aws sts get-caller-identity --output json
TASK=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$API_SERVICE" --query 'services[0].taskDefinition' --output text)
[[ "$TASK" == arn:aws:ecs:*:task-definition/* ]] || { echo 'Stage U API service missing'; exit 2; }
printf '%s\n' "$TASK" > "$STATE/api-before-v.txt"
aws ecs describe-task-definition --task-definition "$TASK" --output json > "$STATE/api-before-v.json"
TAG="v-secure-$(date +%Y%m%dT%H%M%S)"
IMAGE="$ECR_REGISTRY/bikepulse/api:$TAG"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 --load -f backend/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
DIGEST=$(aws ecr describe-images --repository-name bikepulse/api --image-ids "imageTag=$TAG" --query 'imageDetails[0].imageDigest' --output text)
[[ "$DIGEST" == sha256:* ]] || { echo 'ECR digest missing'; exit 2; }
export SECURE_API_IMAGE="$ECR_REGISTRY/bikepulse/api@$DIGEST"
export BIKEPULSE_AF_ALB_ARN="$ALB_ARN"
export ALLOWED_ORIGIN="$APP_URL"
export AUTH_MODE=alb
export BIKEPULSE_AF_ALLOW_STAGING_READONLY=false
export BIKEPULSE_AF_ADMIN_ACTIONS=false
python3 - "$STATE/api-before-v.json" "$STATE/api-secure-register.json" <<'PY'
import json,os,sys
old=json.load(open(sys.argv[1]))['taskDefinition']
allowed=['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','placementConstraints','requiresCompatibilities','cpu','memory','runtimePlatform','ephemeralStorage','proxyConfiguration','pidMode','ipcMode','enableFaultInjection']
new={k:old[k] for k in allowed if k in old}
containers=[c for c in new['containerDefinitions'] if c['name']=='api']
if len(containers)!=1:raise ValueError('Expected one container named api')
c=containers[0];c['image']=os.environ['SECURE_API_IMAGE']
env={x['name']:x['value'] for x in c.get('environment',[])}
for k in ['AUTH_MODE','BIKEPULSE_AF_UI_ENABLED','BIKEPULSE_AF_ALLOW_STAGING_READONLY','BIKEPULSE_AF_ADMIN_ACTIONS','BIKEPULSE_AF_ALB_ARN','BIKEPULSE_AF_ADMIN_SUBS','ALLOWED_ORIGIN']:
 env[k]=os.environ[k]
c['environment']=[{'name':k,'value':v} for k,v in sorted(env.items())]
json.dump(new,open(sys.argv[2],'w'),indent=2)
PY
NEW_TD=$(aws ecs register-task-definition --cli-input-json "file://$STATE/api-secure-register.json" --query 'taskDefinition.taskDefinitionArn' --output text)
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$API_SERVICE" --task-definition "$NEW_TD" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$API_SERVICE"
echo "SECURE API DEPLOYED: $NEW_TD"
echo "To roll back API: aws ecs update-service --cluster $ECS_CLUSTER --service $API_SERVICE --task-definition $TASK"
