"""Additive, read-only AF endpoints; mount via app.include_router(router).
Production: enable only on the browser ALB service protected by Cognito,
with ECS security group accepting requests only from trusted ALB.
Do NOT expose these routes unauthenticated or on a public direct API address.
"""
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from threading import Lock

import boto3
from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from .admin_auth import require_admin, require_dashboard_view, verify_authenticated_alb

router = APIRouter(prefix="/api/v1/ui", tags=["AF Read-only Dashboard"])
_cache = {}
_lock = Lock()


def cfg(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def protect(request: Request):
    # This is only a deployment safety gate, NOT a user authentication mechanism.
    # Existing ALB Cognito authentication + inbound SG controls are mandatory.
    if cfg("BIKEPULSE_AF_LOCAL_DEV") == "1" and cfg("AUTH_MODE") == "local":
        return
    # Staging only: ALB Source-IP restricted /api/* rule required; admin endpoints
    # still require verified ALB Cognito JWT through require_admin.
    if cfg("AUTH_MODE") == "staging" and cfg("BIKEPULSE_AF_UI_ENABLED") == "true" and cfg("BIKEPULSE_AF_ALLOW_STAGING_READONLY") == "true":
        return
    if cfg("BIKEPULSE_AF_UI_ENABLED") != "true" or cfg("AUTH_MODE") != "alb":
        raise HTTPException(403, "Dashboard API unavailable for this deployment")
    verify_authenticated_alb(request)


def memo(key, seconds, callback):
    with _lock:
        record = _cache.get(key)
        if record and record[0] > time.monotonic():
            return record[1]
    value = callback()
    with _lock:
        _cache[key] = (time.monotonic() + seconds, value)
    return value


def model_registry():
    name = cfg("BIKEPULSE_REGISTRY_TABLE", "bikepulse-dev-model-registry")
    return boto3.resource("dynamodb").Table(name)


def active_model():
    row = model_registry().get_item(Key={"model_id": "bike-demand", "model_version": "ALIAS#STAGING"}, ConsistentRead=True).get("Item", {})
    return row.get("target_version")


def athena_rows(sql: str):
    workgroup = cfg("BIKEPULSE_ATHENA_WORKGROUP", "bikepulse-dev-wg")
    database = cfg("BIKEPULSE_ATHENA_DATABASE", "bikepulse_dev")
    client = boto3.client("athena")
    result = client.start_query_execution(
        QueryString=sql, WorkGroup=workgroup,
        QueryExecutionContext={"Database": database, "Catalog": "AwsDataCatalog"},
    )
    query_id = result["QueryExecutionId"]
    deadline = time.monotonic() + 22
    while time.monotonic() < deadline:
        execution = client.get_query_execution(QueryExecutionId=query_id)["QueryExecution"]
        status = execution["Status"]["State"]
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "CANCELLED"):
            raise RuntimeError("Athena query failed: " + str(execution["Status"].get("StateChangeReason", ""))[:250])
        time.sleep(0.5)
    else:
        client.stop_query_execution(QueryExecutionId=query_id)
        raise TimeoutError("Athena exceeded 22 seconds; consider a scheduled pre-aggregated S3 summary")

    rows = []
    paginator = client.get_paginator("get_query_results")
    first_row = True
    for page in paginator.paginate(QueryExecutionId=query_id, PaginationConfig={"PageSize": 1000}):
        for row in page["ResultSet"]["Rows"]:
            values = [x.get("VarCharValue") for x in row["Data"]]
            # Athena header row may begin with hour/dow/month/name, not only day/date.
            if first_row:
                first_row = False
                names = [c.get("Name") for c in page["ResultSet"].get("ResultSetMetadata", {}).get("ColumnInfo", [])]
                if names and values == names:
                    continue
            if values:
                rows.append(values)
    scanned = execution.get("Statistics", {}).get("DataScannedInBytes", 0)
    return rows, scanned


def table_name():
    name = cfg("BIKEPULSE_ATHENA_TABLE")
    if not name or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError("Set BIKEPULSE_ATHENA_TABLE to the existing Glue curated table name")
    return name


def fetch_daily(start=None, end=None, last_n=None):
    name = table_name()
    version = cfg("BIKEPULSE_DATASET_VERSION", "dv001")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", version):
        raise ValueError("Invalid dataset version")
    # Date inputs have been parsed and validated by FastAPI as datetime.date.
    filter_dates = ""
    if start and end:
        filter_dates = f"AND CAST(\"date\" AS DATE) BETWEEN DATE '{start.isoformat()}' AND DATE '{end.isoformat()}'"
    limit = f"LIMIT {int(last_n)}" if last_n else ""
    sql = f'''
        SELECT CAST("date" AS DATE) AS day,
               CAST(SUM(rented_bike_count) AS BIGINT) AS rentals,
               ROUND(AVG(temperature_c), 2) AS mean_temperature_c
          FROM "{name}"
         WHERE version = '{version}'
           {filter_dates}
         GROUP BY CAST("date" AS DATE)
         ORDER BY day DESC
         {limit}
    '''
    values, scan = athena_rows(sql)
    parsed = [{"date": v[0], "rentals": int(v[1]), "mean_temperature_c": float(v[2]) if v[2] is not None else None} for v in values if len(v) >= 3]
    return list(reversed(parsed)), scan


@router.get("/overview", dependencies=[Depends(protect)])
def overview():
    # Stage U first deployment: no Glue/Athena table required to check model state.
    # Empty statistics must never be presented as real observations.
    if cfg("AUTH_MODE") != "local" and cfg("BIKEPULSE_AF_ANALYTICS_ENABLED", "false").lower() != "true":
        return {"source": "NOT_CONFIGURED", "period": "2017-12-01 ~ 2018-11-30",
                "observed_days": 0, "total_rentals": 0,
                "average_daily_rentals": 0, "active_model_version": active_model(),
                "series": [], "note": "Athena not configured. Observed demand is unavailable."}
    def compute():
        rows, _ = fetch_daily(last_n=14)
        total = sum(x["rentals"] for x in rows)
        return {"source": "UCI_HISTORICAL", "period": "2017-12-01 ~ 2018-11-30",
                "observed_days": len(rows), "total_rentals": total,
                "average_daily_rentals": round(total / len(rows), 1) if rows else 0,
                "active_model_version": active_model(), "series": rows}
    try:
        return memo("overview", 900, compute)
    except (ValueError, TimeoutError, RuntimeError) as e:
        raise HTTPException(503, str(e)) from e


@router.get("/historical", dependencies=[Depends(protect)])
def historical(start: date = Query(...), end: date = Query(...)):
    if start < date(2017, 12, 1) or end > date(2018, 11, 30) or end < start or (end - start).days > 89:
        raise HTTPException(422, "Choose an inclusive 1–90-day range in 2017-12-01..2018-11-30")
    if cfg("AUTH_MODE") != "local" and cfg("BIKEPULSE_AF_ANALYTICS_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Historical Athena integration not enabled")
    def compute():
        rows, scanned = fetch_daily(start, end)
        return {"source": "UCI_HISTORICAL", "start": start.isoformat(), "end": end.isoformat(),
                "rows": rows, "total_rentals": sum(x["rentals"] for x in rows), "scanned_bytes": scanned}
    try:
        return memo(f"hist:{start}:{end}", 900, compute)
    except (ValueError, TimeoutError, RuntimeError) as e:
        raise HTTPException(503, str(e)) from e


def recent_drift():
    prefix = cfg("BIKEPULSE_DRIFT_PREFIX", "monitoring/drift/reports/feature_version=fv001/")
    bucket = cfg("BIKEPULSE_BUCKET")
    if not bucket:
        return None
    s3 = boto3.client("s3")
    candidates = []
    pager = s3.get_paginator("list_objects_v2")
    for index, page in enumerate(pager.paginate(Bucket=bucket, Prefix=prefix, PaginationConfig={"PageSize": 1000})):
        candidates.extend(x for x in page.get("Contents", []) if x["Key"].endswith(("drift_report.json", "/report.json")))
        if index >= 9:  # limit bounded work; use a dedicated latest.json pointer in production
            break
    if not candidates:
        return None
    last = max(candidates, key=lambda x: x["LastModified"])
    import json
    body = s3.get_object(Bucket=bucket, Key=last["Key"])["Body"].read(1000000)
    report = json.loads(body)
    value = report.get("decision", "UNSPECIFIED")
    return {"decision": value if isinstance(value, str) else str(value),
            "execution_status": report.get("execution_status"),
            "report_date": report.get("created_at") or last["LastModified"].isoformat()}


@router.get("/mlops", dependencies=[Depends(protect), Depends(require_dashboard_view)])
def mlops():
    def compute():
        table = model_registry()
        active = active_model()
        response = table.query(KeyConditionExpression=Key("model_id").eq("bike-demand"), Limit=100)
        models = []
        for m in response.get("Items", []):
            if str(m.get("model_version", "")).startswith("ALIAS#"):
                continue
            models.append({"version":m.get("model_version"), **{k: m.get(k) for k in ("status", "dataset_version", "feature_version", "release_health", "promoted_at")}})
        models.sort(key=lambda m: str(m.get("version", "")), reverse=True)
        return {"active_model_version": active, "models": models,
                "latest_drift": recent_drift(), "note": "읽기 전용: 승인·재학습·배포는 기존 AWS 승인 게이트에서 수행"}
    return memo("mlops", 60, compute)


def cloudwatch_stats(namespace, metric, dimensions, statistic="Sum"):
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=65)
    client = boto3.client("cloudwatch")
    result = client.get_metric_statistics(Namespace=namespace, MetricName=metric,
        Dimensions=dimensions, StartTime=start, EndTime=now, Period=300, Statistics=[statistic])
    return sorted(result.get("Datapoints", []), key=lambda x: x["Timestamp"])


def recent_mean(items, stat="Average"):
    return float(items[-1][stat]) if items else None


@router.get("/operations", dependencies=[Depends(protect), Depends(require_dashboard_view)])
def operations():
    def compute():
        cluster = cfg("BIKEPULSE_ECS_CLUSTER", "bikepulse-dev-ecs")
        names = [x.strip() for x in cfg("BIKEPULSE_UI_SERVICES", "bikepulse-dev-api-service").split(",") if x.strip()]
        if not names or len(names) > 10:
            raise ValueError("BIKEPULSE_UI_SERVICES requires 1–10 names")
        ecs = boto3.client("ecs")
        results = ecs.describe_services(cluster=cluster, services=names)
        services = []
        for s in results.get("services", []):
            dims = [{"Name": "ClusterName", "Value": cluster}, {"Name": "ServiceName", "Value": s["serviceName"]}]
            cpu = recent_mean(cloudwatch_stats("AWS/ECS", "CPUUtilization", dims, "Average"))
            ram = recent_mean(cloudwatch_stats("AWS/ECS", "MemoryUtilization", dims, "Average"))
            services.append({"name": s["serviceName"], "status": s["status"],
                             "desired": s["desiredCount"], "running": s["runningCount"],
                             "cpu_percent": cpu, "memory_percent": ram})
        present = {x["name"] for x in services}
        for name in names:
            if name not in present:
                services.append({"name": name, "status": "MISSING", "desired": 0, "running": 0, "cpu_percent": None, "memory_percent": None})
        alb = cfg("BIKEPULSE_ALB_DIMENSION")
        tg = cfg("BIKEPULSE_TARGET_GROUP_DIMENSION")
        points = {}
        if alb:
            dims = [{"Name": "LoadBalancer", "Value": alb}]
            for point in cloudwatch_stats("AWS/ApplicationELB", "RequestCount", dims):
                t = point["Timestamp"].replace(second=0, microsecond=0).isoformat()
                points.setdefault(t, {"time": t, "requests": None, "errors": None})["requests"] = int(point["Sum"])
            if tg:
                dims.append({"Name": "TargetGroup", "Value": tg})
                for point in cloudwatch_stats("AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", dims):
                    t = point["Timestamp"].replace(second=0, microsecond=0).isoformat()
                    points.setdefault(t, {"time": t, "requests": None, "errors": None})["errors"] = int(point["Sum"])
        series = [points[k] for k in sorted(points)][-12:]
        requests = [x["requests"] for x in series if x["requests"] is not None]
        errors = [x["errors"] for x in series if x["errors"] is not None]
        return {"source": "AWS_CLOUDWATCH", "region": boto3.session.Session().region_name or "unknown",
                "measured_at": datetime.now(timezone.utc).isoformat(), "services": services,
                "alb_metrics": series, "request_count_1h": sum(requests) if requests else None,
                "target_5xx_1h": sum(errors) if errors else None,
                "note": "CloudWatch 지표는 지연·미수집 구간이 있을 수 있습니다. ALB의 active Target Group dimension을 배포 후 갱신하세요."}
    try:
        return memo("operations", 60, compute)
    except ValueError as e:
        raise HTTPException(503, str(e)) from e


# Additive U analytics: actual past observations, never synthetic in this endpoint.
# Costs Athena scan charges, cached for 15 minutes.
@router.get("/analytics", dependencies=[Depends(protect)])
def analytics():
    if cfg("BIKEPULSE_AF_ANALYTICS_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Analytics disabled; enable only after Glue schema preflight")
    def compute():
        table = table_name()
        dataset = cfg("BIKEPULSE_DATASET_VERSION", "dv001")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", dataset):
            raise ValueError("Invalid dataset version")
        # Explicit TRY_CAST handles CSV/Parquet crawler type differences safely.
        where = f"WHERE version = '{dataset}' AND TRY_CAST(hour AS INTEGER) BETWEEN 0 AND 23 AND TRY_CAST(rented_bike_count AS DOUBLE) IS NOT NULL"
        queries = {
            "hourly": f'SELECT TRY_CAST(hour AS INTEGER) AS hour, ROUND(AVG(TRY_CAST(rented_bike_count AS DOUBLE)),0) AS rentals FROM "{table}" {where} GROUP BY 1 ORDER BY 1',
            "weekday_weekend": f'''SELECT CASE WHEN day_of_week(TRY_CAST("date" AS DATE)) >= 6 THEN '주말' ELSE '평일' END AS name, ROUND(AVG(TRY_CAST(rented_bike_count AS DOUBLE)),0) AS rentals FROM "{table}" {where} AND TRY_CAST("date" AS DATE) IS NOT NULL GROUP BY 1 ORDER BY 1''',
            "heatmap": f'''SELECT CAST(day_of_week(TRY_CAST("date" AS DATE)) - 1 AS INTEGER) AS dow, TRY_CAST(hour AS INTEGER) AS hour, ROUND(AVG(TRY_CAST(rented_bike_count AS DOUBLE)),0) AS rentals FROM "{table}" {where} AND TRY_CAST("date" AS DATE) IS NOT NULL GROUP BY 1,2 ORDER BY 1,2''',
            "monthly": f'''SELECT month(TRY_CAST("date" AS DATE)) AS month, ROUND(AVG(TRY_CAST(rented_bike_count AS DOUBLE)),0) AS rentals FROM "{table}" {where} AND TRY_CAST("date" AS DATE) IS NOT NULL GROUP BY 1 ORDER BY 1''',
            "rainy": f'''SELECT CASE WHEN TRY_CAST(rainfall_mm AS DOUBLE)>0 THEN '강수' ELSE '무강수' END AS name, ROUND(AVG(TRY_CAST(rented_bike_count AS DOUBLE)),0) AS rentals FROM "{table}" {where} AND TRY_CAST(rainfall_mm AS DOUBLE) IS NOT NULL GROUP BY 1 ORDER BY 1''',
        }
        results = {}
        total_scan = 0
        # Bound Athena fan-out: no more than 3 concurrent queries.
        # Serial 5 * 22 second waits may exceed an ALB idle timeout.
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {key: pool.submit(athena_rows, sql) for key, sql in queries.items()}
            raw_results = {key: future.result() for key, future in futures.items()}
        for key, (records, scan) in raw_results.items():
            total_scan += scan
            if key == "heatmap":
                results[key] = [{"day_of_week": int(x[0]), "hour": int(x[1]), "rentals": int(float(x[2]))} for x in records if len(x)>=3 and None not in x[:3]]
            elif key in ("hourly", "monthly"):
                field = "hour" if key == "hourly" else "month"
                results[key] = [{field: int(x[0]), "rentals": int(float(x[1]))} for x in records if len(x)>=2 and None not in x[:2]]
            else:
                results[key] = [{"name": str(x[0]), "rentals": int(float(x[1]))} for x in records if len(x)>=2 and None not in x[:2]]
        return {"source": "UCI_HISTORICAL", **results, "scanned_bytes": total_scan}
    try:
        return memo("analytics:dv001", 900, compute)
    except Exception as e:
        # Do not leak SQL text or internal AWS credentials to the browser.
        raise HTTPException(503, "Athena analytics failed. Check Glue schema and CloudWatch logs.") from e


@router.get("/workflow", dependencies=[Depends(protect), Depends(require_dashboard_view)])
def workflow():
    arn = cfg("BIKEPULSE_AF_WORKFLOW_ARN")
    actions_on = cfg("BIKEPULSE_AF_ADMIN_ACTIONS") == "true"
    if not arn:
        return {"configured": False, "admin_actions_enabled": False, "executions": [], "note": "단계 U: State Machine ARN 미설정"}
    client = boto3.client("stepfunctions")
    try:
        data = client.list_executions(stateMachineArn=arn, maxResults=10)
        return {"configured": True, "admin_actions_enabled": actions_on, "executions": [{"name":x["name"],"status":x["status"],"started_at":x["startDate"].isoformat()} for x in data.get("executions",[])], "note": "인증된 관리자에게만 표시"}
    except Exception as e:
        raise HTTPException(503, "Step Functions query unavailable") from e


@router.get("/deployments", dependencies=[Depends(protect), Depends(require_dashboard_view)])
def deployments():
    names = [x.strip() for x in cfg("BIKEPULSE_UI_SERVICES", "bikepulse-dev-api-service").split(",") if x.strip()]
    cluster = cfg("BIKEPULSE_ECS_CLUSTER", "bikepulse-dev-ecs")
    data = boto3.client("ecs").describe_services(cluster=cluster, services=names)
    return {"services": [{"name":x["serviceName"], "events":[{"message":v.get("message","")[:500],"created_at":v["createdAt"].isoformat()} for v in x.get("events",[])[:6]],"deployments":[{"status":d.get("status"),"task_definition":d.get("taskDefinition"),"running":d.get("runningCount",0),"desired":d.get("desiredCount",0)} for d in x.get("deployments",[])[:4]]} for x in data.get("services",[])]}


@router.post("/admin/start-workflow", dependencies=[Depends(protect), Depends(require_admin)])
def start_admin_workflow(request: Request, action: str = Query(..., pattern="^(retrain|deploy)$")):
    # Hard disable by default. Explicit allowlisted state machine, strict origin, HTTPS and admin ALB identity.
    if cfg("BIKEPULSE_AF_ADMIN_ACTIONS") != "true":
        raise HTTPException(403, "Admin actions disabled by default")
    if request.url.scheme != "https" and request.headers.get("x-forwarded-proto") != "https":
        raise HTTPException(403, "HTTPS required")
    origin = cfg("ALLOWED_ORIGIN")
    if not origin or request.headers.get("origin") != origin or request.headers.get("x-requested-with") != "BikePulseDashboard":
        raise HTTPException(403, "Cross-origin action denied")
    if cfg("AUTH_MODE") != "alb":
        raise HTTPException(403, "Cognito ALB authentication required")
    arn = cfg("BIKEPULSE_AF_RETRAIN_ARN") if action == "retrain" else cfg("BIKEPULSE_AF_DEPLOY_ARN")
    if not arn:
        raise HTTPException(503, "Requested State Machine not configured")
    import uuid
    import json
    from datetime import datetime
    result = boto3.client("stepfunctions").start_execution(
        stateMachineArn=arn,
        name=f"bikepulse-ui-{action}-{uuid.uuid4().hex[:14]}",
        input=json.dumps({"source":"bikepulse-dashboard","action":action,"requested_at":datetime.now(timezone.utc).isoformat()}),
    )
    return {"execution_arn":result["executionArn"],"status":"STARTED"}
