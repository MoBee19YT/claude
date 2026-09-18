"""
Core data-access service: PostGIS bbox queries, filters, and the "live
fallback" cache-warming path.

Design: parking data is meant to live in PostGIS, populated ahead of time
by scripts/import_osm.py for whatever region you care about. But so the
app is genuinely usable the moment you start it (before you've thought
to run an import script), this service also warms the cache lazily: when
a requested map viewport falls in a ~2km grid cell nobody has fetched
yet, it calls every *configured* provider for that cell, merges their
results, and upserts them - then always answers from the database. This
keeps a hard cap on how much traffic ever reaches Overpass/TomTom/HERE
and means an already-empty area is only ever checked once.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from geoalchemy2.types import Geography
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.parking import ImportCell, Parking
from app.providers.base import NormalizedParking
from app.providers.registry import get_configured_providers
from app.services.merge_service import merge_and_dedupe
from app.services.opening_hours import is_open_now

logger = logging.getLogger(__name__)

GRID_SIZE_DEG = 0.02  # roughly 1.5-2.2km depending on latitude
MAX_CELLS_PER_WARM = 6  # beyond this, rely on pre-imported data; don't hammer live APIs
CACHE_SOURCE_LABEL = "combined"

# Cells whose last warm attempt failed, and when. Overpass rate-limits cloud
# IPs hard, so without a cooldown a failing cell would be retried on every
# single request forever. In-memory on purpose: a restart is a fine moment to
# try again, and this never needs to be shared between workers.
FAILED_CELL_COOLDOWN_SECONDS = 600
# Gap between consecutive Overpass calls during background/bulk warming.
OVERPASS_POLITENESS_DELAY_SECONDS = 1.0
_failed_cells: dict[tuple[int, int], float] = {}
# Cells currently being fetched, so concurrent map pans don't start duplicate
# Overpass calls for the same area.
_in_flight_cells: set[tuple[int, int]] = set()


@dataclass
class ParkingFilters:
    types: Optional[list[str]] = None
    free: bool = False
    paid: bool = False
    resident: bool = False
    private: bool = False
    ev: bool = False
    accessible: bool = False
    covered: bool = False
    availability_known: bool = False
    open_now: bool = False
    max_price: Optional[float] = None
    max_walk_distance_m: Optional[float] = None


def _apply_sql_filters(stmt, filters: ParkingFilters):
    if filters.types:
        stmt = stmt.where(Parking.parking_type.in_(filters.types))
    if filters.free:
        stmt = stmt.where(Parking.fee.is_(False))
    if filters.paid:
        stmt = stmt.where(Parking.fee.is_(True))
    if filters.resident:
        stmt = stmt.where(Parking.resident_only.is_(True))
    if filters.private:
        stmt = stmt.where(Parking.access == "private")
    if filters.ev:
        stmt = stmt.where(Parking.ev.is_(True))
    if filters.accessible:
        stmt = stmt.where(Parking.accessible.is_(True))
    if filters.covered:
        stmt = stmt.where(Parking.covered.is_(True))
    if filters.availability_known:
        stmt = stmt.where(Parking.availability_type != "unknown")
    return stmt


def _post_filter(
    rows: list[Parking], filters: ParkingFilters, ref_point: Optional[tuple[float, float]]
) -> list[Parking]:
    from app.services.geo_utils import haversine_m, row_centroid_lonlat

    out = []
    for row in rows:
        if filters.open_now and is_open_now(row.opening_hours) is not True:
            continue
        if filters.max_price is not None and row.price is not None and row.fee is not False:
            if float(row.price) > filters.max_price:
                continue
        if filters.max_walk_distance_m is not None and ref_point is not None:
            lon, lat = row_centroid_lonlat(row.centroid)
            if haversine_m(ref_point[0], ref_point[1], lon, lat) > filters.max_walk_distance_m:
                continue
        out.append(row)
    return out


def _limit_for_zoom(zoom: Optional[float]) -> int:
    if zoom is None:
        return 500
    if zoom < 12:
        return 400
    if zoom < 14:
        return 800
    if zoom < 16:
        return 1500
    return 3000


def cells_for_bbox(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float
) -> list[tuple[int, int]]:
    x0, x1 = math.floor(min_lon / GRID_SIZE_DEG), math.floor(max_lon / GRID_SIZE_DEG)
    y0, y1 = math.floor(min_lat / GRID_SIZE_DEG), math.floor(max_lat / GRID_SIZE_DEG)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def _cell_bbox(cell_x: int, cell_y: int) -> tuple[float, float, float, float]:
    return (
        cell_x * GRID_SIZE_DEG,
        cell_y * GRID_SIZE_DEG,
        (cell_x + 1) * GRID_SIZE_DEG,
        (cell_y + 1) * GRID_SIZE_DEG,
    )


async def find_cells_to_warm(
    db: AsyncSession, min_lon: float, min_lat: float, max_lon: float, max_lat: float
) -> list[tuple[int, int]]:
    """Which grid cells covering this bbox still need fetching from the live
    providers. Cheap, DB-only - safe to call inside a request."""
    settings = get_settings()
    if not settings.osm_live_fallback:
        return []

    cells = cells_for_bbox(min_lon, min_lat, max_lon, max_lat)
    if not cells or len(cells) > MAX_CELLS_PER_WARM:
        return []

    xs = {c[0] for c in cells}
    ys = {c[1] for c in cells}
    existing = await db.execute(
        select(ImportCell.cell_x, ImportCell.cell_y).where(
            ImportCell.source == CACHE_SOURCE_LABEL,
            ImportCell.cell_x.in_(xs),
            ImportCell.cell_y.in_(ys),
        )
    )
    cached = {(row[0], row[1]) for row in existing.all()}
    now = time.monotonic()
    return [
        cell
        for cell in cells
        if cell not in cached
        and cell not in _in_flight_cells
        and now - _failed_cells.get(cell, 0.0) > FAILED_CELL_COOLDOWN_SECONDS
    ]


async def find_uncached_cells(
    db: AsyncSession, min_lon: float, min_lat: float, max_lon: float, max_lat: float, limit: int
) -> tuple[list[tuple[int, int]], int]:
    """Every not-yet-imported cell covering a bbox, for bulk imports.

    Unlike `find_cells_to_warm` this ignores the per-request cap and the
    failure cooldown - an explicit import is a deliberate act, so it should
    retry things the passive path has given up on. Returns (cells to do now,
    total still outstanding) so a caller can show progress.
    """
    cells = cells_for_bbox(min_lon, min_lat, max_lon, max_lat)
    if not cells:
        return [], 0

    existing = await db.execute(
        select(ImportCell.cell_x, ImportCell.cell_y).where(ImportCell.source == CACHE_SOURCE_LABEL)
    )
    cached = {(row[0], row[1]) for row in existing.all()}
    outstanding = [c for c in cells if c not in cached and c not in _in_flight_cells]
    return outstanding[:limit], len(outstanding)


async def warm_cells(cells: list[tuple[int, int]]) -> None:
    """Fetch the given cells from every configured provider and store them.

    Runs as a background task *after* the HTTP response has been sent - an
    Overpass round trip can take tens of seconds, and blocking the request on
    it made the map appear to load forever and then fail. The map simply
    serves whatever is already in PostGIS and picks the new data up on the
    next pan.
    """
    if not cells:
        return

    providers = get_configured_providers()
    for index, cell in enumerate(cells):
        if cell in _in_flight_cells:
            continue
        if index:
            # Overpass is a donated public service - space out bulk requests
            # rather than firing a whole city's worth back to back.
            await asyncio.sleep(OVERPASS_POLITENESS_DELAY_SECONDS)
        _in_flight_cells.add(cell)
        try:
            cell_x, cell_y = cell
            bbox = _cell_bbox(cell_x, cell_y)
            records: list[NormalizedParking] = []
            failed = False
            for provider in providers:
                try:
                    records.extend(await provider.fetch_bbox(*bbox))
                except Exception:
                    logger.warning("Provider %s failed for cell (%s,%s)", provider.name, cell_x, cell_y)
                    failed = True
                    break

            if failed:
                _failed_cells[cell] = time.monotonic()
                continue

            merged = merge_and_dedupe(records)
            async with AsyncSessionLocal() as db:
                await upsert_records(db, merged)
                await db.execute(
                    pg_insert(ImportCell)
                    .values(
                        cell_x=cell_x,
                        cell_y=cell_y,
                        source=CACHE_SOURCE_LABEL,
                        grid_size=GRID_SIZE_DEG,
                        feature_count=len(merged),
                    )
                    .on_conflict_do_nothing()
                )
                await db.commit()
            _failed_cells.pop(cell, None)
        finally:
            _in_flight_cells.discard(cell)


async def upsert_records(db: AsyncSession, records: list[NormalizedParking]) -> int:
    if not records:
        return 0

    for r in records:
        centroid_lon, centroid_lat = _centroid_of(r)
        geom_sql = func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(r.geometry)), 4326)
        centroid_sql = func.ST_SetSRID(func.ST_MakePoint(centroid_lon, centroid_lat), 4326)

        values = dict(
            primary_source=r.source,
            primary_source_id=r.source_id,
            sources=r.sources,
            source_ids=r.source_ids,
            geometry=geom_sql,
            centroid=centroid_sql,
            parking_type=r.parking_type,
            access=r.access,
            fee=r.fee,
            price=r.price,
            price_period=r.price_period,
            currency=r.currency,
            capacity=r.capacity,
            capacity_disabled=r.capacity_disabled,
            opening_hours=r.opening_hours,
            max_stay=r.max_stay,
            resident_only=r.resident_only,
            ev=r.ev,
            accessible=r.accessible,
            covered=r.covered,
            availability_count=r.availability_count,
            availability_type=r.availability_type,
            availability_updated=r.availability_updated,
            confidence=r.confidence,
            name=r.name,
            address=r.address,
            country=r.country,
            city=r.city,
            raw_tags=r.raw_tags,
            last_updated=func.now(),
        )
        stmt = pg_insert(Parking).values(**values)
        update_cols = {k: v for k, v in values.items() if k not in ("primary_source", "primary_source_id")}
        stmt = stmt.on_conflict_do_update(
            index_elements=["primary_source", "primary_source_id"], set_=update_cols
        )
        await db.execute(stmt)

    await db.commit()
    return len(records)


def _centroid_of(r: NormalizedParking) -> tuple[float, float]:
    from app.services.geo_utils import centroid_lonlat

    return centroid_lonlat(r.geometry)


async def get_parking_in_bbox(
    db: AsyncSession,
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    zoom: Optional[float],
    filters: ParkingFilters,
    ref_point: Optional[tuple[float, float]] = None,
) -> tuple[list[Parking], bool]:
    limit = _limit_for_zoom(zoom)
    needs_python_postfilter = filters.open_now or filters.max_price is not None or filters.max_walk_distance_m is not None
    fetch_limit = limit * 3 if needs_python_postfilter else limit

    envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
    stmt = select(Parking).where(func.ST_Intersects(Parking.geometry, envelope))
    stmt = _apply_sql_filters(stmt, filters)
    stmt = stmt.order_by(Parking.confidence.desc().nullslast(), Parking.capacity.desc().nullslast())
    stmt = stmt.limit(fetch_limit)

    rows = list((await db.execute(stmt)).scalars().all())
    rows = _post_filter(rows, filters, ref_point)
    truncated = len(rows) > limit
    return rows[:limit], truncated


async def get_parking_near(
    db: AsyncSession,
    lat: float,
    lon: float,
    radius_m: float,
    filters: ParkingFilters,
) -> list[Parking]:
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    stmt = select(Parking).where(
        func.ST_DWithin(
            func.cast(Parking.centroid, Geography),
            func.cast(point, Geography),
            radius_m,
        )
    )
    stmt = _apply_sql_filters(stmt, filters)
    stmt = stmt.limit(200)

    rows = list((await db.execute(stmt)).scalars().all())
    return _post_filter(rows, filters, (lon, lat))


async def get_parking_by_id(db: AsyncSession, parking_id: UUID) -> Optional[Parking]:
    return await db.get(Parking, parking_id)
