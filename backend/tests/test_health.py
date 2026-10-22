"""Healthcheck endpoint automated tests."""

from starlette.testclient import TestClient


def test_healthcheck_returns_ok(client: TestClient):
    """Verify GET /health returns 200 and {'status': 'ok'}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
