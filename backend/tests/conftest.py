"""Shared test fixtures for backend test suite."""

import pytest
from starlette.testclient import TestClient
from backend.app.database import init_db
from backend.app.main import app


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensure database schema is created prior to test execution."""
    init_db()


@pytest.fixture
def client():
    """Provides a Starlette TestClient instance bound to the FastAPI application."""
    return TestClient(app)
