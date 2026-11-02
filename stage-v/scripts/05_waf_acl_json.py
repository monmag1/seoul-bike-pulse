#!/usr/bin/env python3
"""Create region-scoped WAF v2 rate ACL JSON for CLI, POST predict only.
No AWS writes. Use aws wafv2 create-web-acl --cli-input-json file://...
"""
import json,sys
from pathlib import Path
p=Path(sys.argv[1]) if len(sys.argv)>1 else Path('infrastructure/waf/v-web-acl.json')
p.parent.mkdir(parents=True,exist_ok=True)
method={'ByteMatchStatement':{'SearchString':'POST','FieldToMatch':{'Method':{}},'TextTransformations':[{'Priority':0,'Type':'NONE'}],'PositionalConstraint':'EXACTLY'}}
path={'ByteMatchStatement':{'SearchString':'/api/v1/predict','FieldToMatch':{'UriPath':{}},'TextTransformations':[{'Priority':0,'Type':'NONE'}],'PositionalConstraint':'EXACTLY'}}
rule={'Name':'bikepulse-dev-predict-rate-limit','Priority':0,'Statement':{'RateBasedStatement':{'Limit':300,'EvaluationWindowSec':300,'AggregateKeyType':'IP','ScopeDownStatement':{'AndStatement':{'Statements':[method,path]}}}},'Action':{'Block':{}},'VisibilityConfig':{'SampledRequestsEnabled':True,'CloudWatchMetricsEnabled':True,'MetricName':'BikePulsePredictRateLimit'}}
acl={'Name':'bikepulse-dev-web-acl','Scope':'REGIONAL','DefaultAction':{'Allow':{}},'Description':'BikePulse STAGING signed-in model POST abuse throttle','Rules':[rule],'VisibilityConfig':{'SampledRequestsEnabled':True,'CloudWatchMetricsEnabled':True,'MetricName':'BikePulseWebACL'}}
p.write_text(json.dumps(acl,indent=2)+'\n',encoding='utf-8')
print(p)
