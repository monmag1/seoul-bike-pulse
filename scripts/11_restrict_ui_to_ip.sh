#!/usr/bin/env bash
set -euo pipefail

: "${TEST_CLIENT_CIDR:?TEST_CLIENT_CIDR is required}"

ALB_NAME="bikepulse-dev-alb"
FRONTEND_TG_NAME="bikepulse-dev-tg-frontend"

echo "[1/5] ALB 조회"

ALB_ARN="$(aws elbv2 describe-load-balancers \
  --names "$ALB_NAME" \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)"

LISTENER_ARN="$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`80`].ListenerArn | [0]' \
  --output text)"

FRONTEND_TG_ARN="$(aws elbv2 describe-target-groups \
  --names "$FRONTEND_TG_NAME" \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)"

echo "[2/5] 기존 규칙 확인"

RULES_JSON="$(aws elbv2 describe-rules \
  --listener-arn "$LISTENER_ARN" \
  --output json)"

RULES_JSON="$RULES_JSON" python3 - "$TEST_CLIENT_CIDR" "$FRONTEND_TG_ARN" <<'PY'
import json, os, sys, ipaddress

rules = json.loads(os.environ["RULES_JSON"])["Rules"]
cidr, frontend_arn = sys.argv[1:]

network = ipaddress.ip_network(cidr, strict=True)
if network.version != 4 or network.prefixlen != 32:
    raise SystemExit("실습 PC IPv4 /32 주소만 허용합니다.")

by_priority = {r["Priority"]: r for r in rules}

for priority in ("10", "11", "default"):
    if priority not in by_priority:
        raise SystemExit(f"필수 규칙 누락: {priority}")

r10 = by_priority["10"]
r11 = by_priority["11"]
default = by_priority["default"]

def has_api_path(rule):
    return any(
        "/api/*" in c.get("PathPatternConfig", {}).get("Values", c.get("Values", []))
        for c in rule["Conditions"]
        if c["Field"] == "path-pattern"
    )

def has_source(rule, value):
    return any(
        value in c.get("SourceIpConfig", {}).get("Values", [])
        for c in rule["Conditions"]
        if c["Field"] == "source-ip"
    )

if not (has_api_path(r10) and has_source(r10, cidr)
        and r10["Actions"][0]["Type"] == "forward"):
    raise SystemExit("우선순위 10의 API/IP 규칙이 예상과 다릅니다.")

if not (has_api_path(r11)
        and r11["Actions"][0]["Type"] == "fixed-response"
        and r11["Actions"][0]["FixedResponseConfig"]["StatusCode"] == "403"):
    raise SystemExit("우선순위 11의 API 차단 규칙이 예상과 다릅니다.")

if "20" in by_priority:
    r20 = by_priority["20"]
    if not (has_source(r20, cidr)
            and r20["Actions"][0]["Type"] == "forward"
            and r20["Actions"][0].get("TargetGroupArn") == frontend_arn):
        raise SystemExit("기존 우선순위 20 규칙이 예상과 다릅니다.")

action = default["Actions"][0]
valid_default = (
    action["Type"] == "forward"
    and action.get("TargetGroupArn") == frontend_arn
) or (
    action["Type"] == "fixed-response"
    and action["FixedResponseConfig"]["StatusCode"] == "403"
)

if not valid_default:
    raise SystemExit("기본 동작이 예상과 다릅니다.")
PY

echo "[3/5] 우선순위 20 Frontend 허용 규칙 생성"

RULE_20_ARN="$(aws elbv2 describe-rules \
  --listener-arn "$LISTENER_ARN" \
  --query "Rules[?Priority=='20'].RuleArn | [0]" \
  --output text)"

if [[ "$RULE_20_ARN" == "None" || -z "$RULE_20_ARN" ]]; then
  aws elbv2 create-rule \
    --listener-arn "$LISTENER_ARN" \
    --priority 20 \
    --conditions "Field=source-ip,SourceIpConfig={Values=[$TEST_CLIENT_CIDR]}" \
    --actions "Type=forward,TargetGroupArn=$FRONTEND_TG_ARN" \
    --output json > /dev/null
else
  echo "우선순위 20 규칙이 이미 존재합니다."
fi

echo "[4/5] 기본 동작을 HTTP 403으로 변경"

aws elbv2 modify-listener \
  --listener-arn "$LISTENER_ARN" \
  --default-actions \
    'Type=fixed-response,FixedResponseConfig={StatusCode=403,ContentType=text/plain,MessageBody=Forbidden}' \
  --output json > /dev/null

echo "[5/5] 최종 규칙 확인"

aws elbv2 describe-rules \
  --listener-arn "$LISTENER_ARN" \
  --query 'Rules[].{Priority:Priority,Conditions:Conditions,Actions:Actions}' \
  --output json

echo "Frontend IP 접근 제한 설정 완료"
