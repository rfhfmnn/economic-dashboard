import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.database import engine, init_db
from backend.app.routes.export_routes import router as export_router
from backend.app.routes.macro_routes import router as macro_router
from backend.app.routes.rem_routes import router as rem_router
from backend.app.routes.risk_routes import router as risk_router
from backend.app.routes.system_routes import router as system_router
from backend.app.telemetry import init_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database schema on startup
    init_db()
    # Emit baseline application info metric for telemetry discovery
    try:
        from backend.app.metrics import record_app_info
        record_app_info()
    except Exception:
        pass
    yield


app = FastAPI(
    title="Economic & Credit Risk Dashboard (BCRA)",
    description="Institutional-grade financial and credit risk intelligence dashboard API.",
    version="0.1.0",
    lifespan=lifespan,
)

# Instrument FastAPI, HTTPX, and SQLAlchemy with OpenTelemetry
init_telemetry(app=app, engine=engine)

# Configure CORS for local development and frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST API routers
app.include_router(macro_router)
app.include_router(rem_router)
app.include_router(risk_router)
app.include_router(export_router)
app.include_router(system_router)


@app.get("/health")
def healthcheck():
    """Service healthcheck endpoint."""
    return {"status": "ok"}


# Resolve built frontend static directory (for production and container deployments)
STATIC_DIR_ENV = os.getenv("STATIC_DIR")
if STATIC_DIR_ENV:
    STATIC_DIR = Path(STATIC_DIR_ENV).resolve()
else:
    repo_dist = (Path(__file__).resolve().parent.parent.parent / "frontend" / "dist").resolve()
    container_dist = Path("/app/frontend/dist").resolve()
    if repo_dist.exists() and (repo_dist / "index.html").exists():
        STATIC_DIR = repo_dist
    elif container_dist.exists() and (container_dist / "index.html").exists():
        STATIC_DIR = container_dist
    else:
        STATIC_DIR = repo_dist

if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        """Serve SPA index.html at root."""
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve static files or fallback to index.html for client-side SPA routing."""
        # Avoid intercepting nonexistent API endpoints, healthcheck or docs
        if (
            full_path.startswith("api/")
            or full_path == "api"
            or full_path == "health"
            or full_path in ("docs", "redoc", "openapi.json")
        ):
            raise HTTPException(status_code=404, detail="Not Found")

        # Serve static file if it physically exists inside STATIC_DIR
        candidate = (STATIC_DIR / full_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(STATIC_DIR)):
            return FileResponse(candidate)

        # Fallback to SPA index.html for client-side navigation (e.g., /macro, /risk, /batch)
        index_file = STATIC_DIR / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)

        raise HTTPException(status_code=404, detail="Frontend assets not found")


