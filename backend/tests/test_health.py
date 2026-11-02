from fastapi.testclient import TestClient
from app.main import app


def test_root():
    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200

    data = response.json()
    assert data["service"] == "bikepulse-api"
    assert data["api_version"] == "v1"


def test_health():
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert "model_id" in data
    assert "model_version" in data
