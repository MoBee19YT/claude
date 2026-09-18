from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import parking_filters, parse_bbox
from app.database import get_db
from app.providers.registry import get_all_providers, get_configured_providers
from app.schemas.parking import (
    FindParkingResponse,
    FindParkingResult,
    ParkingFeature,
    ParkingFeatureCollection,
    ParkingFeatureMeta,
    ProviderStatus,
    ProvidersMeta,
)
from app.services.parking_service import (
    ParkingFilters,
    find_cells_to_warm,
    get_parking_by_id,
    get_parking_in_bbox,
    get_parking_near,
    warm_cells,
)
from app.services.ranking_service import rank_candidates
from app.services.serialization import row_to_feature

router = APIRouter(tags=["parking"])


def _providers_meta() -> tuple[list[str], list[str]]:
    active = [p.name for p in get_configured_providers()]
    not_configured = [p.name for p in get_all_providers() if p.name not in active]
    return active, not_configured


@router.get("/parking", response_model=ParkingFeatureCollection)
async def list_parking(
    background_tasks: BackgroundTasks,
    bbox: str = Query(..., description="min_lon,min_lat,max_lon,max_lat"),
    zoom: Optional[float] = Query(None, ge=0, le=24),
    ref_lat: Optional[float] = Query(None, description="Reference point for distance_m, e.g. map center"),
    ref_lon: Optional[float] = Query(None),
    filters: ParkingFilters = Depends(parking_filters),
    db: AsyncSession = Depends(get_db),
):
    try:
        min_lon, min_lat, max_lon, max_lat = parse_bbox(bbox)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ref_point = (ref_lon, ref_lat) if ref_lon is not None and ref_lat is not None else None

    rows, truncated = await get_parking_in_bbox(
        db, min_lon, min_lat, max_lon, max_lat, zoom, filters, ref_point=ref_point
    )

    # Answer from PostGIS immediately; fetch any not-yet-cached cells from the
    # live providers after the response is sent, so a slow Overpass round trip
    # can never stall (or fail) the map request.
    cells = await find_cells_to_warm(db, min_lon, min_lat, max_lon, max_lat)
    if cells:
        background_tasks.add_task(warm_cells, cells)
    features: list[ParkingFeature] = [row_to_feature(row, ref_point=ref_point) for row in rows]

    active, not_configured = _providers_meta()
    meta = ParkingFeatureMeta(
        count=len(features),
        providers_active=active,
        providers_available_not_configured=not_configured,
        truncated=truncated,
    )
    return ParkingFeatureCollection(features=features, meta=meta)


@router.get("/parking/{parking_id}", response_model=ParkingFeature)
async def get_parking(parking_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await get_parking_by_id(db, parking_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Parking facility not found")
    return row_to_feature(row)


@router.get("/find-parking", response_model=FindParkingResponse)
async def find_parking(
    background_tasks: BackgroundTasks,
    lat: float = Query(..., description="Latitude to search around (current location or destination)"),
    lon: float = Query(...),
    radius_m: float = Query(800, gt=0, le=5000),
    filters: ParkingFilters = Depends(parking_filters),
    db: AsyncSession = Depends(get_db),
):
    rows = await get_parking_near(db, lat, lon, radius_m, filters)

    degrees = radius_m / 111_000
    cells = await find_cells_to_warm(db, lon - degrees, lat - degrees, lon + degrees, lat + degrees)
    if cells:
        background_tasks.add_task(warm_cells, cells)
    max_walk = filters.max_walk_distance_m or radius_m
    results: list[FindParkingResult] = rank_candidates(rows, (lon, lat), max_walk_m=max_walk)

    active, not_configured = _providers_meta()
    meta = ParkingFeatureMeta(
        count=len(results), providers_active=active, providers_available_not_configured=not_configured
    )
    return FindParkingResponse(results=results, meta=meta)


@router.get("/meta/providers", response_model=ProvidersMeta)
async def providers_meta():
    providers = [
        ProviderStatus(name=p.name, configured=p.is_configured(), description=p.description())
        for p in get_all_providers()
    ]
    return ProvidersMeta(providers=providers)
