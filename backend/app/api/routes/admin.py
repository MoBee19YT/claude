"""
Operator endpoints for populating the database without shell access.

These are the browser-clickable equivalent of `python -m scripts.import_osm`,
for deployments (Render's free tier, most PaaS) where you can't open a shell
on the server. They are disabled unless ADMIN_TOKEN is set, and every call
must present that token - importing is expensive for us and for the public
Overpass API, so it must not be triggerable by anyone who guesses the URL.
"""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import parse_bbox
from app.config import get_settings
from app.database import get_db
from app.models.parking import ImportCell, Parking
from app.services import parking_service
from app.services.parking_service import find_uncached_cells, warm_cells

router = APIRouter(tags=["admin"])

# Kept well below the idle timeout of a small free-tier instance: each cell is
# one Overpass round trip plus a politeness delay, so a few dozen per call
# finishes in a couple of minutes. Call it repeatedly to work through a city.
DEFAULT_IMPORT_CELL_LIMIT = 40


def require_admin_token(token: str = Query(..., description="Value of the ADMIN_TOKEN env var")) -> None:
    configured = get_settings().admin_token
    if not configured:
        raise HTTPException(
            status_code=403,
            detail=(
                "Admin endpoints are disabled. Set an ADMIN_TOKEN environment "
                "variable on the server to enable them, then pass it as ?token=..."
            ),
        )
    if not secrets.compare_digest(token, configured):
        raise HTTPException(status_code=403, detail="Invalid admin token")


@router.get("/admin/import", dependencies=[Depends(require_admin_token)])
async def start_import(
    background_tasks: BackgroundTasks,
    bbox: Optional[str] = Query(None, description="min_lon,min_lat,max_lon,max_lat; defaults to DEFAULT_BBOX"),
    limit: int = Query(DEFAULT_IMPORT_CELL_LIMIT, ge=1, le=200, description="Grid cells to fetch in this call"),
    db: AsyncSession = Depends(get_db),
):
    """Import OpenStreetMap parking for a region, a chunk at a time.

    Returns immediately and does the fetching in the background; re-call it
    until `remaining` reaches 0.
    """
    settings = get_settings()
    if bbox:
        try:
            bounds = parse_bbox(bbox)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        bounds = settings.default_bbox_tuple

    cells, outstanding = await find_uncached_cells(db, *bounds, limit=limit)
    if cells:
        background_tasks.add_task(warm_cells, cells)

    return {
        "status": "started" if cells else "nothing to do",
        "bbox": list(bounds),
        "cells_started": len(cells),
        "remaining_after_this": max(0, outstanding - len(cells)),
        "note": (
            "Fetching runs in the background - watch /api/v1/admin/status. "
            "Call this endpoint again while 'remaining_after_this' is above 0."
        ),
    }


@router.get("/admin/status", dependencies=[Depends(require_admin_token)])
async def import_status(db: AsyncSession = Depends(get_db)):
    """How much data is in the database and what the importer is doing."""
    parking_count = (await db.execute(select(func.count()).select_from(Parking))).scalar_one()
    cell_count = (await db.execute(select(func.count()).select_from(ImportCell))).scalar_one()

    return {
        "parking_facilities": parking_count,
        "cells_imported": cell_count,
        "cells_in_progress": len(parking_service._in_flight_cells),
        "cells_failed_recently": len(parking_service._failed_cells),
        "providers_active": [p.name for p in parking_service.get_configured_providers()],
    }
