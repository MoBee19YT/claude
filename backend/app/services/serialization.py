"""Converts a `Parking` ORM row into the API's GeoJSON representation."""
from __future__ import annotations

from typing import Optional

from app.models.parking import Parking
from app.providers.osm_provider import street_side_from_tags
from app.schemas.parking import ParkingFeature, ParkingProperties
from app.services.geo_utils import geometry_column_to_geojson, haversine_m, row_centroid_lonlat
from app.services.opening_hours import is_open_now


def row_to_feature(row: Parking, ref_point: Optional[tuple[float, float]] = None) -> ParkingFeature:
    geometry = geometry_column_to_geojson(row.geometry)

    distance_m = None
    if ref_point is not None:
        lon, lat = row_centroid_lonlat(row.centroid)
        distance_m = haversine_m(ref_point[0], ref_point[1], lon, lat)

    props = ParkingProperties(
        id=row.id,
        sources=row.sources or [row.primary_source],
        source_ids=row.source_ids or {row.primary_source: row.primary_source_id},
        parking_type=row.parking_type,
        access=row.access,
        street_side=street_side_from_tags(row.raw_tags or {}) if row.parking_type == "street" else None,
        fee=row.fee,
        price=float(row.price) if row.price is not None else None,
        price_period=row.price_period,
        currency=row.currency,
        capacity=row.capacity,
        capacity_disabled=row.capacity_disabled,
        opening_hours=row.opening_hours,
        max_stay=row.max_stay,
        resident_only=row.resident_only,
        ev=row.ev,
        accessible=row.accessible,
        covered=row.covered,
        availability_count=row.availability_count,
        availability_type=row.availability_type,
        availability_updated=row.availability_updated,
        confidence=float(row.confidence) if row.confidence is not None else None,
        name=row.name,
        address=row.address,
        country=row.country,
        city=row.city,
        last_updated=row.last_updated,
        is_open_now=is_open_now(row.opening_hours),
        distance_m=distance_m,
    )
    return ParkingFeature(geometry=geometry, properties=props)
