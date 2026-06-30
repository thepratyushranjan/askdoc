from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_healthz():
    response = client.get("/api/v1/healthz")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "uptime_seconds" in data

def test_metrics():
    response = client.get("/api/v1/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "http_requests_total" in data
    assert "llm_token_usage" in data
