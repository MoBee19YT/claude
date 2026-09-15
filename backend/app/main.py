"""
FastAPI application entrypoint.

Run with: uvicorn app.main:app --reload
Interactive API docs are then at http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, parking, search
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Parking Discovery API",
    description=(
        "Worldwide parking discovery backend. Combines OpenStreetMap and "
        "(optionally) TomTom/HERE into one normalized parking model. "
        "Data is © OpenStreetMap contributors, available under the Open "
        "Database License (https://www.openstreetmap.org/copyright)."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(parking.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Parking Discovery API",
        "docs": "/docs",
        "attribution": "© OpenStreetMap contributors",
    }
