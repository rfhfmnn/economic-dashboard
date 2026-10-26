import sys
from pathlib import Path

# Ensure root workspace directory is on sys.path regardless of execution context
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Ensure minimal frontend/dist placeholder exists if not already built so static serving tests pass
frontend_dist = ROOT_DIR / "frontend" / "dist"
if not (frontend_dist / "index.html").exists():
    frontend_dist.mkdir(parents=True, exist_ok=True)
    (frontend_dist / "index.html").write_text(
        "<!DOCTYPE html><html><head><title>App</title></head><body><div id='root'></div></body></html>",
        encoding="utf-8",
    )

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
