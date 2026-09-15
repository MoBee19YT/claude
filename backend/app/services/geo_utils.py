"""Small geometry helpers shared across providers/services."""
from __future__ import annotations

import math
from typing import Any

from geoalchemy2.shape import to_shape
from shapely.geometry import mapping, shape


def centroid_lonlat(geometry: dict) -> tuple[float, float]:
    geom = shape(geometry)
    c = geom.centroid
    return c.x, c.y


def row_centroid_lonlat(centroid_column: Any) -> tuple[float, float]:
    """`centroid_column` is a GeoAlchemy2 WKBElement (e.g. `parking.centroid`)."""
    point = to_shape(centroid_column)
    return point.x, point.y


def geometry_column_to_geojson(geometry_column: Any) -> dict:
    return mapping(to_shape(geometry_column))


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(a)))
