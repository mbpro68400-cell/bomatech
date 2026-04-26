"""Smoke tests — ensure the app boots and /health responds."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"


def test_openapi_schema_available():
    with TestClient(app) as client:
        r = client.get("/openapi.json")
        assert r.status_code == 200
        schema = r.json()
        assert schema["info"]["title"] == "Bomatech API"
