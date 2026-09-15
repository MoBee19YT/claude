"""Shared FastAPI dependencies for the parking routes."""
from __future__ import annotations

from typing import Optional

from fastapi import Query

from app.services.parking_service import ParkingFilters

VALID_TYPES = {"lot", "garage", "street", "space"}


def parking_filters(
    type: Optional[list[str]] = Query(None, description="Filter by parking_type; repeat for multiple"),
    free: bool = Query(False),
    paid: bool = Query(False),
    resident: bool = Query(False),
    private: bool = Query(False),
    ev: bool = Query(False),
    accessible: bool = Query(False),
    covered: bool = Query(False),
    availability_known: bool = Query(False),
    open_now: bool = Query(False),
    max_price: Optional[float] = Query(None, ge=0),
    max_walk_distance_m: Optional[float] = Query(None, ge=0),
) -> ParkingFilters:
    types = [t for t in (type or []) if t in VALID_TYPES] or None
    return ParkingFilters(
        types=types,
        free=free,
        paid=paid,
        resident=resident,
        private=private,
        ev=ev,
        accessible=accessible,
        covered=covered,
        availability_known=availability_known,
        open_now=open_now,
        max_price=max_price,
        max_walk_distance_m=max_walk_distance_m,
    )


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError
    except ValueError as exc:
        raise ValueError("bbox must be 'min_lon,min_lat,max_lon,max_lat'") from exc
    return parts[0], parts[1], parts[2], parts[3]
