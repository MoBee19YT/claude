"""
Search / geocoding via Nominatim, OpenStreetMap's free geocoder.

Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
requires a valid identifying User-Agent and asks for light request volume -
this is a single public instance shared by everyone, not a scalable
backend for a worldwide product. For real production traffic, self-host
Nominatim or switch to a paid geocoder; the function signature here
wouldn't need to change.
"""
from __future__ import annotations

import httpx

from app.config import get_settings
from app.schemas.parking import SearchResult

SEARCH_PATH = "/search"


async def search_places(query: str, limit: int = 8) -> list[SearchResult]:
    settings = get_settings()
    if not query or not query.strip():
        return []

    params = {
        "q": query,
        "format": "jsonv2",
        "limit": limit,
        "addressdetails": 1,
    }
    headers = {
        "User-Agent": f"parking-discovery-mvp ({settings.nominatim_contact_email})",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{settings.nominatim_url}{SEARCH_PATH}", params=params, headers=headers
        )
        response.raise_for_status()
        payload = response.json()

    results: list[SearchResult] = []
    for item in payload:
        try:
            lat = float(item["lat"])
            lon = float(item["lon"])
        except (KeyError, ValueError):
            continue
        bbox = None
        raw_bbox = item.get("boundingbox")
        if raw_bbox and len(raw_bbox) == 4:
            south, north, west, east = (float(x) for x in raw_bbox)
            bbox = (west, south, east, north)
        results.append(
            SearchResult(
                label=item.get("display_name", query),
                address=item.get("display_name"),
                latitude=lat,
                longitude=lon,
                type=item.get("type"),
                bbox=bbox,
            )
        )
    return results
