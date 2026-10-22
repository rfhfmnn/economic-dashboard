"""FastAPI application entrypoint for the Economic & Credit Risk Dashboard."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Economic & Credit Risk Dashboard (BCRA)",
    description="Institutional-grade financial and credit risk intelligence dashboard API.",
    version="0.1.0",
)

# Configure CORS for local development and frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck():
    """Service healthcheck endpoint."""
    return {"status": "ok"}
