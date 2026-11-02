#!/usr/bin/env bash
set -euo pipefail
: "${HTTP_LISTENER_ARN:?}" "${HTTPS_LISTENER_ARN:?}" "${APP_URL:?}"
[[ "$APP_URL" == https://* ]] || { echo 'APP_URL must be https';exit 2; }
STATE="${PROJECT:-$HOME/seoul-bike-pulse}/.bikepulse-v-state"
mkdir -p "$STATE"
aws elbv2 describe-rules --listener-arn "$HTTP_LISTENER_ARN" --output json > "$STATE/http-rules-before-v.json"
aws elbv2 describe-listeners --listener-arns "$HTTP_LISTENER_ARN" --output json > "$STATE/http-listener-before-v.json"
# Only the dedicated BikePulse listener with priorities 10, 11, 20 is eligible for automatic deletion.
mapfile -t LINES < <(jq -r '.Rules[] | select(.IsDefault==false) | [.Priority,.RuleArn] | @tsv' "$STATE/http-rules-before-v.json")
for entry in "${LINES[@]}";do
 read -r priority arn <<<"$entry"
 case "$priority" in 10|11|20) ;; *) echo "Unexpected HTTP rule priority=$priority; refuse mutation";exit 2;; esac
done
# First fail closed: replace *all* HTTP forwarding rules with fixed 403.
for entry in "${LINES[@]}";do
 read -r priority arn <<<"$entry"
 aws elbv2 modify-rule --rule-arn "$arn" --actions 'Type=fixed-response,FixedResponseConfig={ContentType=text/plain,MessageBody=HTTPSRequired,StatusCode=403}' >/dev/null
done
# Default action redirects; once changed, remove the temporarily denied rules.
aws elbv2 modify-listener --listener-arn "$HTTP_LISTENER_ARN" --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' >/dev/null
for entry in "${LINES[@]}";do
 read -r priority arn <<<"$entry"
 aws elbv2 delete-rule --rule-arn "$arn" >/dev/null
done
remaining=$(aws elbv2 describe-rules --listener-arn "$HTTP_LISTENER_ARN" --query 'length(Rules[?IsDefault==`false`])' --output text)
[[ "$remaining" == 0 ]] || { echo "Unexpected HTTP rules remain: $remaining";exit 2; }
echo 'HTTP:80 has no priority rules, default HTTPS:443 redirect only'
