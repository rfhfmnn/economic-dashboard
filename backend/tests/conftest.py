import sys
from pathlib import Path

# Ensure root workspace directory is on sys.path regardless of execution context
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

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
