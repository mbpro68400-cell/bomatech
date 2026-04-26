"""FastAPI application entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    forecast,
    insights,
    simulation,
    state,
    transactions,
    upload,
)

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Bomatech API",
    description="Copilote financier — API REST",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health
@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# Routers
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(state.router, prefix="/api/v1", tags=["state"])
app.include_router(simulation.router, prefix="/api/v1", tags=["simulation"])
app.include_router(forecast.router, prefix="/api/v1", tags=["forecast"])
app.include_router(insights.router, prefix="/api/v1", tags=["insights"])
app.include_router(upload.router, prefix="/api/v1", tags=["upload"])


@app.on_event("startup")
async def startup() -> None:
    logger.info("Bomatech API starting in %s mode", settings.ENVIRONMENT)
