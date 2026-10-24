"""FastAPI application entrypoint for the Economic & Credit Risk Dashboard."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.database import init_db
from backend.app.routes.export_routes import router as export_router
from backend.app.routes.macro_routes import router as macro_router
from backend.app.routes.rem_routes import router as rem_router
from backend.app.routes.risk_routes import router as risk_router
from backend.app.routes.system_routes import router as system_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database schema on startup
    init_db()
    yield


app = FastAPI(
    title="Economic & Credit Risk Dashboard (BCRA)",
    description="Institutional-grade financial and credit risk intelligence dashboard API.",
    version="0.1.0",
    lifespan=lifespan,
)

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

