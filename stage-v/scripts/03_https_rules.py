#!/usr/bin/env python3
"""Generate ALB action files for Stage V. Does not change AWS resources."""
import json,os,sys
from pathlib import Path
for x in ['USER_POOL_ARN','APP_CLIENT_ID','COGNITO_DOMAIN_PREFIX','FRONTEND_TG_ARN','API_TG_ARN']:
    if not os.getenv(x) or os.environ[x]=='None':
        raise SystemExit(f'Missing {x}')
config={'UserPoolArn':os.environ['USER_POOL_ARN'],'UserPoolClientId':os.environ['APP_CLIENT_ID'],
        'UserPoolDomain':os.environ['COGNITO_DOMAIN_PREFIX'],'SessionCookieName':'BikePulseAuth',
        'SessionTimeout':3600,'Scope':'openid email profile'}
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path('infrastructure/alb');out.mkdir(parents=True,exist_ok=True)
for name, target, unauth in [('frontend',os.environ['FRONTEND_TG_ARN'],'authenticate'),('api',os.environ['API_TG_ARN'],'deny')]:
    cfg={**config,'OnUnauthenticatedRequest':unauth}
    actions=[{'Type':'authenticate-cognito','Order':1,'AuthenticateCognitoConfig':cfg},
             {'Type':'forward','Order':2,'TargetGroupArn':target}]
    (out/f'https-{name}-actions.json').write_text(json.dumps(actions,indent=2)+'\n')
    print(out/f'https-{name}-actions.json')
