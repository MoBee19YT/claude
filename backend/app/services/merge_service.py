"""
Merges parking records from multiple providers that describe the same
real-world facility, so the map never shows the same parking lot twice
just because both OpenStreetMap and TomTom happen to know about it.

Two records from *different* sources are considered the same facility if
their centroids are within MERGE_DISTANCE_M of each other and their
parking types are compatible (lot/garage are treated as compatible since
the distinction is often just OSM tagging detail). Matching is a simple
union-find over pairwise distance - the provider count per bbox is small
(tens to low hundreds), so this stays fast without a spatial index.
"""
from __future__ import annotations

from dataclasses import replace

from app.providers.base import NormalizedParking
from app.services.geo_utils import centroid_lonlat, haversine_m

MERGE_DISTANCE_M = 20

_SOURCE_PRIORITY = {"openstreetmap": 0, "tomtom": 1, "here": 2}

_FILL_GAP_FIELDS = (
    "name",
    "address",
    "price",
    "currency",
    "price_period",
    "capacity",
    "capacity_disabled",
    "opening_hours",
    "max_stay",
    "fee",
    "access",
    "resident_only",
    "ev",
    "accessible",
    "covered",
)


def merge_and_dedupe(records: list[NormalizedParking]) -> list[NormalizedParking]:
    n = len(records)
    if n <= 1:
        return list(records)

    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    centroids = [centroid_lonlat(r.geometry) for r in records]
    compatible_types = {"lot", "garage"}

    for i in range(n):
        for j in range(i + 1, n):
            a, b = records[i], records[j]
            if a.source == b.source:
                continue
            if a.parking_type != b.parking_type and not (
                {a.parking_type, b.parking_type} <= compatible_types
            ):
                continue
            lon1, lat1 = centroids[i]
            lon2, lat2 = centroids[j]
            if haversine_m(lon1, lat1, lon2, lat2) <= MERGE_DISTANCE_M:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for i in range(n):
        clusters.setdefault(find(i), []).append(i)

    return [_merge_group([records[i] for i in idxs]) for idxs in clusters.values()]


def _merge_group(group: list[NormalizedParking]) -> NormalizedParking:
    if len(group) == 1:
        return group[0]

    primary = min(group, key=lambda r: _SOURCE_PRIORITY.get(r.source, 99))
    sources = sorted({s for r in group for s in r.sources})
    source_ids: dict[str, str] = {}
    for r in group:
        source_ids.update(r.source_ids)

    merged = replace(primary, sources=sources, source_ids=source_ids)

    for field_name in _FILL_GAP_FIELDS:
        if getattr(merged, field_name) is not None:
            continue
        for r in group:
            if r is primary:
                continue
            value = getattr(r, field_name)
            if value is not None:
                setattr(merged, field_name, value)
                break

    # More independent sources agreeing this facility exists -> more confidence.
    merged.confidence = min(1.0, max(r.confidence for r in group) + 0.1 * (len(group) - 1))
    return merged
