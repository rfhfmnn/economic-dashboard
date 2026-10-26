"""Tests for FastAPI serving the built frontend static files and SPA fallback routing."""

import pytest
from starlette.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_serve_root_returns_spa_html(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "<html" in response.text.lower() or "<!doctype html>" in response.text.lower()


def test_serve_spa_client_side_routes_return_html(client: TestClient):
    for route in ["/macro", "/risk", "/portfolio", "/rem"]:
        response = client.get(route)
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "<html" in response.text.lower() or "<!doctype html>" in response.text.lower()


def test_healthcheck_endpoint_is_not_intercepted(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_unknown_route_returns_404_json(client: TestClient):
    response = client.get("/api/nonexistent_route")
    assert response.status_code == 404
    assert "detail" in response.json()


def test_api_real_route_functions_properly(client: TestClient):
    response = client.get("/api/system/status")
    assert response.status_code == 200
    assert "status" in response.json()
