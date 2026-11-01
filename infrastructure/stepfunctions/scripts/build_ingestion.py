import json
import os
from pathlib import Path

import boto3


# --------------------------------------------------
# 1. Environment and ECS resources
# --------------------------------------------------
REQUIRED_ENV = (
    "AWS_REGION",
    "ECS_CLUSTER",
    "INGESTION_TASK_DEF_ARN",
    "PRIVATE_A",
    "SG_MLOPS",
)

missing = [
    name
    for name in REQUIRED_ENV
    if not os.environ.get(name)
]

if missing:
    raise ValueError(
        "Missing environment variables: "
        + ", ".join(missing)
    )

region = os.environ["AWS_REGION"]

ecs = boto3.client(
    "ecs",
    region_name=region
)

cluster_response = ecs.describe_clusters(
    clusters=[
        os.environ["ECS_CLUSTER"]
    ]
)

if (
    cluster_response.get("failures")
    or len(cluster_response.get("clusters", [])) != 1
):
    raise ValueError(
        "ECS cluster not found: "
        + os.environ["ECS_CLUSTER"]
    )

cluster = cluster_response["clusters"][0]

if cluster.get("status") != "ACTIVE":
    raise ValueError(
        "ECS cluster is not ACTIVE"
    )

cluster_arn = cluster["clusterArn"]

task_definition_arn = os.environ[
    "INGESTION_TASK_DEF_ARN"
]

task_definition = ecs.describe_task_definition(
    taskDefinition=task_definition_arn
)["taskDefinition"]

if task_definition.get("status") != "ACTIVE":
    raise ValueError(
        "Ingestion Task Definition is not ACTIVE"
    )

if task_definition.get("networkMode") != "awsvpc":
    raise ValueError(
        "Ingestion Task Definition must use awsvpc network mode"
    )

containers = task_definition.get(
    "containerDefinitions",
    []
)

if (
    len(containers) != 1
    or containers[0].get("name") != "ingestion"
):
    raise ValueError(
        "Ingestion Task Definition must have "
        "exactly one container named 'ingestion'"
    )


# --------------------------------------------------
# 2. Validate EventBridge S3 event
# --------------------------------------------------
event_conditions = [
    {
        "Variable": "$.source",
        "IsPresent": True
    },
    {
        "Variable": "$.source",
        "StringEquals": "aws.s3"
    },
    {
        "Variable": "$['detail-type']",
        "IsPresent": True
    },
    {
        "Variable": "$['detail-type']",
        "StringEquals": "Object Created"
    },
    {
        "Variable": "$.detail.bucket.name",
        "IsPresent": True
    },
    {
        "Variable": "$.detail.object.key",
        "IsPresent": True
    },
    {
        "Variable": "$.detail.object.key",
        "IsString": True
    }
]

# 프로젝트 버킷 변수가 설정되어 있으면
# 다른 버킷에서 발생한 이벤트를 차단합니다.
expected_bucket = os.environ.get(
    "BIKEPULSE_BUCKET",
    ""
).strip()

if expected_bucket:
    event_conditions.append(
        {
            "Variable": "$.detail.bucket.name",
            "StringEquals": expected_bucket
        }
    )


# --------------------------------------------------
# 3. Ingestion state machine definition
# --------------------------------------------------
exit_code_path = (
    "$.ecsResult.Containers[0].ExitCode"
)

definition = {
    "Comment": (
        "BikePulse S3 EventBridge ingestion validation"
    ),
    "QueryLanguage": "JSONPath",
    "StartAt": "CheckS3Event",
    "TimeoutSeconds": 1200,
    "States": {
        "CheckS3Event": {
            "Type": "Choice",
            "Choices": [
                {
                    "And": event_conditions,
                    "Next": "RunIngestionWorker"
                }
            ],
            "Default": "IngestionFailed"
        },

        "RunIngestionWorker": {
            "Type": "Task",
            "Resource": (
                "arn:aws:states:::ecs:runTask.sync"
            ),
            "Parameters": {
                "Cluster": cluster_arn,
                "TaskDefinition": task_definition_arn,
                "LaunchType": "FARGATE",
                "PlatformVersion": "LATEST",

                "NetworkConfiguration": {
                    "AwsvpcConfiguration": {
                        "Subnets": [
                            os.environ["PRIVATE_A"]
                        ],
                        "SecurityGroups": [
                            os.environ["SG_MLOPS"]
                        ],
                        "AssignPublicIp": "DISABLED"
                    }
                },

                "Overrides": {
                    "ContainerOverrides": [
                        {
                            "Name": "ingestion",
                            "Environment": [
                                {
                                    "Name": "S3_EVENT_JSON",
                                    "Value.$": (
                                        "States.JsonToString($)"
                                    )
                                }
                            ]
                        }
                    ]
                }
            },

            "TimeoutSeconds": 900,

            "ResultPath": "$.ecsResult",

            "Retry": [
                {
                    "ErrorEquals": [
                        "AmazonECS.Unknown"
                    ],
                    "IntervalSeconds": 10,
                    "MaxAttempts": 2,
                    "BackoffRate": 2
                }
            ],

            "Catch": [
                {
                    "ErrorEquals": [
                        "States.ALL"
                    ],
                    "ResultPath": "$.taskError",
                    "Next": "IngestionFailed"
                }
            ],

            "Next": "CheckWorkerExitCode"
        },

        "CheckWorkerExitCode": {
            "Type": "Choice",
            "Choices": [
                {
                    "And": [
                        {
                            "Variable": exit_code_path,
                            "IsPresent": True
                        },
                        {
                            "Variable": exit_code_path,
                            "IsNumeric": True
                        },
                        {
                            "Variable": exit_code_path,
                            "NumericEquals": 0
                        }
                    ],
                    "Next": "IngestionCompleted"
                }
            ],
            "Default": "IngestionFailed"
        },

        "IngestionCompleted": {
            "Type": "Succeed"
        },

        "IngestionFailed": {
            "Type": "Fail",
            "Error": "BikePulseIngestionFailed",
            "Cause": (
                "Review DynamoDB ingestion ledger, "
                "S3 quality report, and ECS logs"
            )
        }
    }
}


# --------------------------------------------------
# 4. Write ASL JSON
# --------------------------------------------------
path = Path(
    "infrastructure/stepfunctions/definitions/"
    "bikepulse-dev-ingestion-pipeline.asl.json"
)

path.parent.mkdir(
    parents=True,
    exist_ok=True
)

path.write_text(
    json.dumps(
        definition,
        indent=2,
        ensure_ascii=False
    ) + "\n",
    encoding="utf-8"
)

print("INGESTION STATE MACHINE ASL: CREATED")
print("ECS CLUSTER:", cluster_arn)
print("ECS TASK DEFINITION:", task_definition_arn)
print("ECS CONTAINER: ingestion")
print("EXIT CODE PATH:", exit_code_path)
print(
    "S3 BUCKET FILTER:",
    expected_bucket or "EventBridge rule only"
)
print("OUTPUT:", path)
