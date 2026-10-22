"""Shared test fixtures for backend test suite."""

import pytest
from starlette.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client():
    """Provides a Starlette TestClient instance bound to the FastAPI application."""
    return TestClient(app)
