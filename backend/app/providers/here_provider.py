"""
HERE provider.

Uses HERE's Geocoding & Search v7 "Discover" API -
https://www.here.com/docs/bundle/geocoding-and-search-api-developer-guide/page/topics/endpoint-discover-brief.html
Get a free-tier key at https://developer.here.com/, then set
HERE_API_KEY in backend/.env. Until a key is set, `is_configured()`
returns False and this provider is skipped entirely - see
providers/registry.py.

Same honesty note as tomtom_provider.py: the Discover API gives us
facility name/location, not live pricing or occupancy. Those fields are
left as None (unknown) rather than invented. HERE's real-time parking
availability lives in a separate Destination Services product; wire it
into `fetch_bbox` here if you get access to it.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from app.config import get_settings
from app.providers.base import NormalizedParking, ParkingProvider

DISCOVER_URL = "https://discover.search.hereapi.com/v1/discover"


class HereProvider(ParkingProvider):
    name = "here"

    def __init__(self):
        self.settings = get_settings()

    def is_configured(self) -> bool:
        return bool(self.settings.here_api_key)

    def description(self) -> str:
        return "HERE Geocoding & Search (Discover) API. Requires HERE_API_KEY."

    async def fetch_bbox(
        self, min_lon: float, min_lat: float, max_lon: float, max_lat: float
    ) -> list[NormalizedParking]:
        if not self.is_configured():
            return []

        center_lat = (min_lat + max_lat) / 2
        center_lon = (min_lon + max_lon) / 2
        # Rough radius covering the bbox diagonal, capped at HERE's 50km search limit.
        radius_m = min(50_000, _bbox_diagonal_m(min_lon, min_lat, max_lon, max_lat) / 2 + 200)

        params = {
            "apiKey": self.settings.here_api_key,
            "q": "parking",
            "at": f"{center_lat},{center_lon}",
            "in": f"circle:{center_lat},{center_lon};r={int(radius_m)}",
            "limit": 100,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(DISCOVER_URL, params=params)
            response.raise_for_status()
            payload = response.json()

        results: list[NormalizedParking] = []
        for item in payload.get("items", []):
            normalized = self._normalize(item)
            if normalized:
                results.append(normalized)
        return results

    @staticmethod
    def _normalize(item: dict[str, Any]) -> Optional[NormalizedParking]:
        position = item.get("position")
        item_id = item.get("id")
        if not position or not item_id:
            return None

        address = item.get("address", {})

        return NormalizedParking(
            source="here",
            source_id=str(item_id),
            geometry={"type": "Point", "coordinates": [position["lng"], position["lat"]]},
            parking_type="lot",
            access="unknown",
            fee=None,
            price=None,
            currency=None,
            name=item.get("title"),
            address=address.get("label"),
            country=address.get("countryName"),
            city=address.get("city"),
            availability_type="unknown",
            confidence=0.5,
            raw_tags=item,
        )


def _bbox_diagonal_m(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> float:
    import math

    r = 6371000
    lat1, lon1, lat2, lon2 = map(math.radians, [min_lat, min_lon, max_lat, max_lon])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(a)))
